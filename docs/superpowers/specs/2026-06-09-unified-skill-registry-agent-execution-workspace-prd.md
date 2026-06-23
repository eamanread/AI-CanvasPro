# 幻映智能体：统一 Skill Registry 与计划/时间线执行工作台 PRD

日期：2026-06-09
版本：v3.91
方案：B，产品级主线型
最近更新：2026-06-11
状态：已按真实代码、接力文档和项目默会知识推进到 v3.91。v3.91 按用户 7 问锁定的新确认规格完成生成确认重构（Slice 263-267）：①确认口径：只有真正发起生成的动作（queue_generation_task/run_prompt_preset_generation，按 nodeType 归类文/图/视频）才计数与拦截；建空白节点（含 ai-image/ai-video PREP）属结构动作，不拦不计。②触发规则：Plan 模式含图片或视频生成才确认，Act 模式仅视频确认；其余计划（纯结构、纯文本生成）两模式一律自动执行——Plan/Act 的差别收敛为「图片生成是否确认」。③单门：开始前一次确认放行全部，点「确认」即视频授权（executor 包装层尊重 payload.videoAuthorized），APPLY 强确认门退役（按钮常隐）；「授权视频」标签统一为「确认」。④文案与视觉：确认卡主文案「本次将生成 X 个文本节点、X 个图片节点、X 个视频节点，确认执行吗？」（零项省略，渲染层实时覆盖保证导入/恢复来源一致），新增类型数量徽章与高亮确认按钮、确认态绿框样式；修复 line1==line2 重复 bug（去重为状态文案）。⑤两路统一：v2 抽屉与旧 pendingActions 卡片流同一规则源（`modules/assistant/assistantGenerationConfirmation.js`：countGenerationActions/generationConfirmationRequired/generationConfirmationMessage），state 层 canAutoApply 与卡片 requiresConfirmation 均改由新规则驱动，卡片确认一步授权视频。live 验收（真实 8777）：DIRECTOR E2E 7/7（结构计划免确认自动执行的新断言）、LLM E2E 8/8（act 文本分镜自动执行）、IMAGE E2E 5/5（act 图片免确认自动生成）、确认卡视觉 live 3/3 + 截图（文案+徽章+高亮确认成型）。回归：JS 全量 637 pass / 0 fail（11 个旧策略测试按新规格有意更新：plan 自动应用类改 act 或改生成任务 fixture）。已知边界：底部预览勾选行 UI 在新规则下不再可达（生成走消息卡、结构自动执行），部分勾选能力保留在 state 层 setActionSelected 并由卡片 UI 消费；strongConfirm 状态标志保留为内部机制但 UI 门退役。（以下为 v3.90 历史状态）v3.90 完成 QMAI 导演大脑接入的全部产品优化（Slice 256-262，对应架构评审的冗余 5 项/错配 4 项/做得更好 6 项）：①共享净化模块 `modules/assistant/sensitiveDataRules.js` 成为合同净化器与导演上下文净化器的单一规则源（含 Bearer/sk-/本地路径清洗与策略键安全例外表），双净化器漂移面消除。②director 技能注册（第 5 个内置 v2 技能）：forbiddenActions 拦截全部生成类动作，qualityChecks 机器断言，服务端 matchedSkills 强校验 live 双向验证。③第一刀接线落地：`tools/director_plan_runner.mjs`（L3 编译层，node 有文件系统侧）只读加载 QMAI 记忆（三形态自动识别）、派生知识卡、可选消费导出目录 storyboard/action-package/continuity-report 工件、经 buildDirectorBrainCanvasPlan+连续性门产出 v2 合同（intent.matchedSkills=["director"]、plan 按 step_cards/step_shots/step_layout 分桶且 layout 带 dependsOn）；`services/director_bridge_service.py` 每请求新进程 fail-closed；`POST /api/v2/canvas-agent/director/plan` + dispatcher allowlist + `api.directorPlan()`；面板「导演：」命令在 6 道本地闸门之后、模型守卫之前路由（NL 队列控制优先级压过导演，无模型配置也可用），响应走 recordAssistantExecutionFromResponse 完整复用执行工作台——中间那跳 PI 已按评审结论删除，大脑→画布是确定性编译。④prepare 重编译合并：同一 prepare 通道按 matchedSkills 含 director 分流——导演排队任务经 directorPlan(recompile) 按最新 QMAI 记忆重编排，普通任务走原 fresh-context 路径，fail-closed 语义保留。⑤回执导出投影：`export_receipts()` + `GET /api/v2/canvas-agent/receipts` + `tools/export_execution_receipts.py` 产出 huanying-execution-receipts/v1（含指标与撤销计数，脱敏），与 QMAI→Huanying 记忆桥对称单向只读，审片数据飞轮通路打通。⑥golden fixture：`modules/directorBrain/__fixtures__/qmai-live-sample/` 入库（live wiki/memory 三文件布局），loader 契约回归网建立。live 验收（8777 以 HY_QMAI_PROJECT_DIR=fixture 重启）：director 技能拦截 PASS、director/plan 真实出 3 张知识卡 PASS、receipts PASS、DIRECTOR E2E 7/7（「导演：」命令→抽屉→确认→知识卡真实落画布→matchedSkills 全程携带→结构动作零误拦）。回归：JS 全量 567 pass / 0 fail（1 skipped 为 env-gated 真盘测试），Python 8 套全 OK。三红线未破：画布即真相、生成必确认、QMAI 只读。明确未做（按评审结论后置）：PI 双角色拆分、QMAI HTTP 服务化、QMAI 仓库内任何改动（属另一会话）。（以下为 v3.89 历史状态）v3.89 完成全部剩余路线（Slice 251-255）：①指标后端聚合：`CanvasAgentExecutionService.compute_metrics()` + `GET /api/v2/canvas-agent/metrics`（dispatcher allowlist 同步）+ 前端 `fetchMetrics()`；开发者模式详情区新增指标仪表块（命中率/合法率/恢复率/找回率/平均耗时/执行数）。②图形化 DAG：计划区在边列表外新增分层 ASCII 图（`└─▶` 连接符）；执行历史新增状态 chips（全部/已完成/失败/已取消）过滤。③机器可验 qualityChecks：skill.json 新增 `qualityChecks`（requiresActionType/forbidsActionType/maxActions），离线 runner 强制校验 examples，4 个内置 skill 已配置且 12 cases 全过；PI loader 保留该字段。④语义化触发词匹配：精确子串 OR 多词全在场（忽略英文停用词）OR CJK 触发词双半段在场；PI（TS/JS）与 Claw（Python）匹配器同规则镜像——「帮我把画布整理一下」现可命中 canvas_layout。⑤真实图片生成 live E2E：`tools/run_canvas_agent_image_e2e.mjs` 5/5 通过——真实 8777 上分镜+图片计划执行完成，ai-image 节点真实排队并启动生成（queued+started node id 已记录），matchedSkills 在真实链路在场。回归：JS 全量 533 pass / 0 fail，Python 6 套全 OK。新发现边界：Orchestrator 执行路径不回写 `state.generationTasks`（旧 apply 流才回写）→ 面板生成任务跟踪/完成通知在抽屉确认路径缺失，列为下一优先级。（以下为 v3.88 历史状态）v3.88 完成技能强校验真实链路闭环（Slice 249-250）：①Slice 249：PI 包装层本地命中回填——`huanyingTools.ts/js` 的技能定义保留 `triggers` 字段；`piClient.ts/js` 新增 `matchedSkillIdsForMessage()` 按请求消息匹配本地技能触发词，`withResponseContractV2Defaults()` 两条分支（模型自带 v2 字段 / 最小包装）均把本地命中合并进 `intent.matchedSkills`（与模型回传去重合并），模型自带 intent 字段不再被覆盖丢失。②Slice 250：经用户指示重启长驻 `8777` 加载 Slice 241 后端强校验，并补 `storyboard_workflow` 通用触发词“分镜”。live 验证全部通过：后端 `/actions/validate` 携带 matchedSkills 时拦截越界 action（blockedBySkill，live PASS）且不误伤合法 action（live PASS）；LLM E2E 复跑 8/8——真实 gemini 响应的 `matchedSkills` 现为 `["storyboard_workflow"]`，`skillHitRate` 指标从 0 升至 1，E2E 新增两条断言固化该闭环。至此“Skill 作为行动编译器”的完整链路在真实 8777 端到端成立：真实 LLM → 本地命中回填 → execution 持久化 → Orchestrator 校验携带 → 后端按 skill 约束 fail-closed。回归：JS 全量 529 pass / 0 fail，Python 全 OK。（以下为 v3.87 历史状态）v3.87 按审计优先级一次完成 P0-P2 全部条目（Slice 241-248，全程 RED/GREEN）：①P0-1 技能运行时强校验：`CanvasAgentActionSchema.validate_actions()` 新增 `matched_skills` 参数，按 `config/assistant-skills-v2/<id>/skill.json` 的 allowedActions/forbiddenActions 拦截越界 action 并返回 `blockedBySkill`；validate 路由透传 `matchedSkills`；前后端 execution store 持久化 `intent.matchedSkills`；Orchestrator validate payload 携带 matchedSkills，被拦截时写 `blocked_by_skill` 时间线事件（canRetry:false）fail-closed；离线 runner 新增深度断言（examples.json 动作必须符合本 skill 约束、qualityRules 必须非空），内置 4 skill 12 cases 全过。②P0-2 成功指标埋点：新增 `modules/assistant/assistantExecutionMetrics.js::computeExecutionMetrics()`，从 execution store 快照派生第 20 章可计算指标（skillHitRate/actionValidityRate/failureRecoveryRate/findability/avgActionDurationMs 等），并挂入 `debugSnapshot().executionMetrics`。③P0-3 Replay 最小闭环：`orchestrator.replay()` 重放结构动作（create/connect/layout/move/create_group）、生成动作写 `replay_skipped_generation` 跳过；`regenerateStep()` 单步重生成不动 cursor，视频重生成必须重新授权；抽屉新增“回放结构”与选中生成事件的“重新生成此步”。④P1-4 开发者 JSON 面板：详情区“开发者”开关展示选中事件的 id/status/durationMs/target/inverse/developer JSON。⑤P1-6 真实耗时与结构化 target：Orchestrator 注入 `now()`，completed/failed 事件写真实 `durationMs` 与 `target{actionType,nodeType,nodeIds,stepId}`，前后端 sanitize 同步。⑥P2-7 只读依赖 DAG：计划区按 `dependsOn` 渲染“依赖关系”边列表。⑦P2-8 历史分页：执行历史按 10 条分页加载更多。⑧P2-9 共享模型规则：`assistantModelRegistry` raw 层复用文本节点 `isSelectableApiModel` 单一规则源。⑨P2-10 无数量词群组引用：“刚才那几个/那一组”按全部最近引用成组移动。⑩P1-5 真实 8777 LLM→画布全链路 E2E（`tools/run_canvas_agent_llm_e2e.mjs`，真实 UI 驱动：模型菜单选 gemini→输入框发送→抽屉确认→执行）最终 6/6 通过，并在过程中发现且修复一个真实产品 bug（Slice 248）：逐步执行丢失 executor 批内别名映射，模型自定义节点别名（如 story_outline）在后续 update/connect action 中失效——Orchestrator 现维护跨 action 别名表（run/replay 均生效），E2E 验证 7 个 action 全部带真实耗时与真实画布节点 id 完成。回归：JS 全量 525 pass / 0 fail，Python 5 套全 OK。已确认的新边界：真实 LLM 响应的 `intent.matchedSkills` 当前为空（模型不回填、piClient 最小包装不补全）→ skill 强校验在真实链路上拿不到命中清单，离线/显式注入路径已验证；下一优先级是在 PI/Claw 响应包装层按本地命中回填 matchedSkills。（以下为 v3.86 历史状态）v3.86 完成 Slice 240：助手面板模型选择对齐文本生成节点规则。`assistantModelRegistry.js` 新增 `isSelectableTextModelOption()`/`filterSelectableTextModelOptions()`（镜像文本节点 `isSelectableApiModel`：只排除 deleted/disabled，不要求测试通过、不要求配置完整），`isConfiguredTextModelOption()` 不再排除 `status:failed`（未测试通过的模型可选可发送），默认模型仍优先非 failed；面板的菜单渲染、state.modelOptions 归一、守卫候选、fallback、debug 快照统一改用 selectable 过滤，缺 key/baseUrl 的模型在菜单中以禁用态显示原因，发送守卫继续用 configured 规则拦截不可运行的选择。真实 `8777` live 验证 3/3：用户配置中 `status:failed` 的 `gemini-3.1` 现已出现在面板菜单且可选中为当前模型（此前被隐藏）。回归：JS 全量 509 pass / 0 fail。（以下为 v3.85 历史状态）v3.85 完成真实 `8777` 全量 live 验收闭环（Slice 238-239）：①用户关闭旧打包应用并以本仓当前代码重启 `8777` 后，真实 Chromium UI 验收在字面 `8777` 上复跑 17/17 通过（脚本已参数化归档为 `tools/run_canvas_agent_ui_acceptance.mjs`，默认指向 8777，种子数据自清理）。②聊天/LLM 链路按用户指定改用 modelRegistry 的 `gemini-3.1-pro`（grsai 网关）验收：首跑发现并修复第二个真实 bug——Gemini 把 action JSON 包在 markdown 代码栅栏中，`piClient.ts/js parseJsonObject()` 的回退正则锚定行尾导致解析失败、actions 丢失；新增 `stripMarkdownCodeFence()` 先剥栅栏（TS/JS 双改 + focused 测试）。修复后真实 `8777` 上 gemini-3.1-pro 完整应答（9.1s、零 warnings）：`intent/plan/actionsByStep` 完整 v2 contract，actions 含 `create_node`（source-text，标题为 Live 联调验证）与 `focus_nodes`。PI bridge 为 `subprocess.run` 每请求拉起 node，JS 修复即时生效、无需重启服务。至此 PRD 的真实 live 验收边界全部消除：UI（真实 Chromium + 真实 8777）、执行 API、跨重启恢复、队列控制、Undo/冲突、Plan 编辑、历史搜索、LLM v2 contract 均有 live 证据。gpt-5.5（gptclubapi）通道仍受配额封顶限制，但 gemini-3.1-pro 通道完整可用。（以下为 v3.84 历史状态）v3.84 完成 Slice 232-237：①位置级 inverse：`layout_nodes/move_nodes` 执行前经注入 `nodePositionProvider` 捕获 `action.nodeIds` 各节点 `{x,y}`，完成事件生成 `restore_node_position` op（含执行后位置签名）；undo 按签名检测用户移动（`node_moved` 冲突保留），命中则直接还原 `node.x/y`（与 executor 同一直改模式）；前后端 sanitizer 支持该 op。②Plan Board 拖拽排序/recompile 首片：`assistantExecutionStore.reorderPlanSteps()` 校验全量置换、已执行步骤位置不可变、executing 拒绝，并写 `plan_edited` timeline event；展开态未执行步骤可拖拽（dragstart/drop），同时提供“上移/下移”按钮，重排后 best-effort PATCH 后端 plan；recompile 语义=Orchestrator 每次 run()/resume() 从最新 plan 重新编译。③执行历史搜索/筛选：历史入口展开后有 `.hy-canvas-agent-execution-history-search` 输入框，按标题/状态文本过滤最近列表。④展开态 overlay/blur：新增聊天区上方 `.hy-canvas-agent-execution-backdrop`（blur+半透明遮罩），点击收起到状态条；展开态抽屉加 blur/阴影视觉。⑤真实 Chromium UI live 验收（Playwright + 本仓当前代码 `--port=8778` 实例）：17/17 通过，覆盖真实浏览器启动应用、抽屉播种显示、展开计划/时间线、backdrop、步骤停用/重排（含后端同步）、撤销此步/撤销到这里渲染、undo 冲突保留并同步 `undo_conflict`、点击遮罩收起、completed“关闭”、执行历史入口+搜索+找回、无页面错误、种子数据清理。⑥聊天/LLM 链路 live 联调：发现并修复真实 bug——`piSdkAdapter.ts/js` 对 `/openai` 结尾网关 base 误拼 `/openai/chat/completions`（上游 404），现按 Claw 代理同规则拼 `/v1/chat/completions`；修复后请求已打通到真实 LLM 网关，当前止步于用户 API key 配额封顶（$4000）业务错误，拿到完整 v2 completion 需用户续费配额。真实 `8777` 端口验收边界：该端口当前被用户桌面打包应用「幻映工作台1.1.exe」占用（旧打包代码、无 executions 路由），策略不允许自动终止用户进程；除端口号外的全部验收已在同代码 `8778` 实例完成，切到 `8777` 只需用户关闭打包应用并在本仓运行 `python server.py`。（以下为 v3.83 历史状态）v3.83 完成 Slice 229-231：①属性级 inverse 首片：`update_node/update_node_data/set_node_prompt/set_node_model/rename_node` 在执行前经注入 `nodeSnapshotProvider` 捕获节点 `{name,data}` 快照，完成事件生成 `restore_node` inverse op（含执行后签名）；undo 经 `applyInverseOps` 恢复属性并返回 `restoredNodeIds`，签名不一致仍冲突保留；前端 store 与后端 `_sanitize_inverse()` 均支持并脱敏 `restore_node`。②多步“撤销到这里”首片：`orchestrator.undoTo(executionId,{eventId})` 从时间线尾部反向逐一撤销选中事件及其之后所有可撤销事件，跳过已撤销项，聚合 `undoneCount/conflictCount`；详情区在选中事件之后还有可撤销事件时渲染“撤销到这里”。③真实 live 联调首轮完成（经用户授权）：在 `--port=8779` 启动当前代码实例，对 `/api/v2/canvas-agent/executions*` 完成 10 项 live 验证（upsert、inverse 持久化+脱敏、plan enabled PATCH、close visible=false、queue-control top、prepare 路由可达、clear-completed 清理），并 live 验证跨重启 executing→paused 恢复与 `restore_node` 持久化；同时发现用户长驻 `8777` 实例为 2026-06-09 旧代码启动、不含 executions 路由，需人工重启后新功能才可用；无头 preview 浏览器无法完成该重画布应用启动，浏览器级 UI live 验收仍未完成。（以下为 v3.82 历史状态）本轮完成 Slice 222-228 运行时 GREEN，覆盖三条主线：①Phase 4 Undo 首片：`modules/assistant/assistantExecutionOrchestrator.js` 在 `create_node`/`connect_nodes` 成功执行后按结果生成 `inverse.ops`（`remove_node` 带可选 `signature`、`remove_edge`），completed 事件 `canUndo` 按是否有 inverse 决定；新增 `undo(executionId,{eventId})`，要求注入 `applyInverseOps` hook，支持 `undone`/`undo_conflict`/`undo_failed`/`already_undone`/`undo_unavailable` 路径；前端 store `sanitizeTimelineEvent` 与后端 `CanvasAgentExecutionService._sanitize_inverse()` 均持久化并脱敏 `inverse`；`appAssistantPanel.js` 详情区对未撤销且有 inverse 的事件渲染“撤销此步”，默认 wiring 用 `graphStore.removeNode/removeEdge` 施加反向操作，并用创建时 `nodeSignatureProvider` 签名对比检测用户修改：签名不一致或节点缺失写 `undo_conflict` 并保留画布；`appAssistantPanel.autoload.js` 适配器新增 `removeNode`（映射 `deleteNodes`）与 `removeEdge`。②可编辑 Plan Board 首片：`assistantExecutionStore.setPlanStepEnabled()` 只允许非 executing 状态切换未执行步骤、有进度后禁止重新启用；展开态计划区对可编辑状态渲染“停用/启用”toggle，停用步骤显示“（已停用）”，best-effort 同步后端 `plan`；`compilePlanActions()` 既有 `enabled===false` 跳过逻辑被该 UI 真正消费。③抽屉收口三片：completed 执行显示“关闭”按钮，关闭后 `drawerState.visible=false`；无可见执行但项目有 execution 历史时抽屉渲染“执行历史（N）”入口，可展开最近 10 条并点击找回；点击聊天区会把展开态收起为状态条（不隐藏抽屉）。相关回归：`appAssistantPanel.p1Ui.test.js` 105 pass、app 套件 188 pass、assistant 套件 274 pass、`canvas_agent_execution_service_test.py` 13 pass、route/dispatcher 28+14 pass。本轮未启动、重启、停止、检查、探测或访问 `8777`。继续保留真实边界：Undo 仅覆盖 `create_node`/`connect_nodes` 的删除型 inverse，没有 `update_node`/`layout_nodes` 的属性级 inverse、没有“撤销到这里”的多步回滚、没有 Replay；生成资产不受撤销影响（生成动作仍 `canUndo:false`）；Plan Board 仅支持步骤启停，没有拖拽排序、单步执行、DAG 预览和编辑后 recompile；执行历史入口只有最近 10 条列表，没有搜索/筛选/分页；展开态仍无真实 overlay/backdrop 模糊视觉；自然语言队列编辑仍不是完整语义调度器；真实 `8777` live 联调仍未做。

## 1. 背景与目标

幻映智能体当前已经具备聊天、画布上下文提取、模型调用、动作预览、Canvas Skills、预设提示词生成、资产操作、会话记忆等基础能力。但用户在真实使用中仍会遇到几个核心问题：

1. AI 有时知道用户想做什么，但不能稳定转换为正确的画布行动。
2. Claw、PI、Canvas Skills 的能力定义不统一，导致同一个需求在不同链路表现不一致。
3. AI 直接返回或执行 actions 时，用户很难提前理解它准备怎么改画布。
4. 执行后缺少清晰的时间线、撤销、重试和可回放记录，失败排查成本高。
5. 自动整理画布、资产使用、预设提示词生成、故事/分镜工作流需要从“能做”升级为“稳定、可解释、可验收”。

本 PRD 定义一套产品级优化方案：

- 统一 Skill Registry：让 Claw、PI、Canvas Skills 使用同一套技能定义。
- Visual Agent Plan Board：不要让 AI 直接暴露一堆 actions，而是先形成用户可理解的计划。
- Canvas Operation Timeline / Undo / Replay：每次 AI 操作画布都生成可追踪、可撤销、可重试、可回放的时间线。
- 新交互形态：计划板和时间线不做传统底部大抽屉，而是作为输入框上方的一块独立执行抽屉；收起态像输入框的一部分，展开态向上覆盖聊天区域并加轻微渐变/模糊；右下角水平放置操作按钮。

## 2. 设计原则

| 原则 | 说明 |
|---|---|
| 行动先于聊天 | 智能体的核心不是回答，而是把用户指令转成画布行动。 |
| 可见但不打扰 | 计划和时间线要在输入框附近持续可见，但不能遮挡主要画布。 |
| 默认推进 | Act 模式下，低风险创作流程自动执行，不让用户反复确认。 |
| 高风险确认 | 视频生成必须确认；其它高风险操作进入确认态。 |
| 安全线不可被模式覆盖 | Act 模式只能代表低风险自动推进，不能代表视频授权、删除授权或外部系统授权。 |
| 计划可控 | 用户能禁用步骤、调整顺序，但第一版不把计划板做成第二个画布。 |
| 执行可追踪 | 每个 action 都应有状态、对象、耗时、错误摘要、撤销和重试入口。 |
| 失败可恢复 | 根据依赖关系处理失败：无依赖继续，有依赖暂停。 |
| 技能可测试 | 每个 skill 必须有离线回归测试和真实画布模拟测试。 |

### 2.1 真实代码与默会约束

本 PRD 不是从零设计，必须基于当前真实代码演进。以下约束属于实现准入条件：

| 约束 | 当前真实情况 | PRD 修订后的要求 |
|---|---|---|
| Claw Skill Registry | `services/claw_skill_registry_service.py` 已支持旧 `config/assistant-skills/*.json` 和默认 `config/assistant-skills-v2/*/skill.json`；`qualityRubric` 会迁移到 `qualityRules`；v2 同 id 会覆盖旧版。显式传入自定义 `skill_dir` 时，默认 v2 不会自动污染测试，除非显式传 `v2_skill_dir`。 | 后续不能回退这套兼容逻辑；项目级 v2 override 还未做，若要做必须在测试中覆盖“项目级 v2 > 内置 v2 > 旧扁平 skill”。 |
| v2 内置 Skills | `config/assistant-skills-v2/` 现有 4 个场景技能：`canvas_layout`、`prompt_preset_generation`、`asset_usage`、`storyboard_workflow`，每个都有 `skill.json/instructions.md/examples.json/tests.json`。 | 原子技能先映射到 Canvas Skills manifest，不要求第一版都落成独立 v2 目录；但 PRD 和 UI 不能暗示原子 v2 skill 文件已经存在。 |
| Claw Adapter | `services/claw_bridge_service.py` 会把 `assistantSkills` 注入 prompt payload，并由 v2 registry 命中核心场景；`parse_claw_output()` 已保留并清洗 `intent/plan/actionsByStep/execution/developer`。 | 后续重点不是重新做 Claw 注入，而是让前端执行抽屉、Project Execution Store 和 Orchestrator 消费 v2 合同；实际执行前仍必须走 action schema / executor 校验。 |
| PI Agent | `integrations/pi_canvas_agent/src/huanyingTools.ts/js` 已能读取 v2 skills；`piClient.ts/js` 已默认加载 `config/assistant-skills-v2` 并传入 `buildCanvasAgentSystemPrompt(mode, { skills })`；`protocol.ts/js` 已保留 v2 response contract。 | 后续 PI 工作重点是 execution store/timeline 消费 v2 合同，以及继续保持 TS 与 JS runtime mirror 同步。 |
| Canvas Skills | `modules/assistant/canvasSkills/*` 已有 manifest、runtime、executor、trace、schemas、smoke；manifest 暴露 `imageNode.generate`、`textNode.generate`、`videoNode.generate`、`asset.use` 等稳定 id；v2 adapter 最小闭环已实现。 | Unified Skill Registry 只映射到 Canvas Skills 的 skill id、permission、schema 和 runtime，不替代它；后续要补 timeline trace 与视频确认安全策略。 |
| 当前前端 action 流 | `modules/app/appAssistantPanel.js` 仍以 `pendingActions`、preview card、apply button、interaction card 为旧合同兼容流；`normalizeAssistantResponse()` 已保留 v2 字段，面板已把 v2 response 写入 `assistantExecutionStore`，输入框上方抽屉已读取 `snapshot()` 展示收起态、只读展开态、队列横条和时间线详情；v2 抽屉按钮中的暂停/继续/非视频确认/授权视频/重试已接入真实 `assistantExecutionOrchestrator`；选中 timeline 事件的“重试此步/跳过此步”已完成最小 Orchestrator 闭环；选中视频 timeline 事件的“授权视频”已完成最小 UI 闭环；依赖失败/跳过时的 `dependency_blocked` 最小闭环已完成，且 Slice 160 后选中失败/跳过源事件会在详情区显示“后续 N 步依赖这一步”及阻塞步骤名。 | 计划板/时间线要继续兼容旧 `actions`；下一步不是“让 UI 读到 store”或“把按钮接到 Orchestrator”，而是继续补 Undo、完整依赖重编译/结果合并、完整历史入口、完整 Timeline Humanizer 词库/错误中文化、Replay，并把旧 preview/apply 流收敛为底层降级路径。 |
| 当前 executor | `modules/assistant/assistantActionExecutor.js` 是整批 `executeAssistantActions` 循环执行，已能从目标节点推断视频类型并在 `videoAuthorized !== true` 时跳过视频生成；但它不是暂停/重试/时间线 Orchestrator。 | 现有 `assistantExecutionOrchestrator.js` 做逐 action 调度；旧 executor 只作为底层动作执行器和兼容路径。 |
| 当前视频安全线 | `assistantActionExecutor.js` 会挡未授权视频生成；`appAssistantPanel.js` 已移除 `state.agentMode === "act"` 推导 `videoAuthorized=true`；`canvasSkills/registry.js::shouldConfirmCanvasSkillBatch()` 已改成视频生成在 Act 模式仍需确认；`assistantActionPreviewModel.js` 已不再把 Act 视频生成显示为无需确认；执行抽屉在待确认/草稿状态里如发现 pending actions 或 v2 `actionsByStep` 含未授权真实视频生成，会优先显示“授权视频”而不是“确认”；`assistantExecutionOrchestrator.retry()` 在失败 cursor 指向 `ai-video` 生成且未显式授权时会停在 `waiting_video_authorization`，不调用 validate/execute。 | 后续 Orchestrator、Project Execution Store 和未来后端执行链路必须继续保持防线：Act 不等于视频授权，未点“授权视频”不得向 schema/executor/Orchestrator 传 `videoAuthorized=true`。 |
| 当前会话存储 | `assistantConversationStore` 和 `canvas_agent_conversation_service.py` 保存 messages、contextSnapshots、transactions、generationTasks、receipts；Slice 212 后，本地 `assistantConversationStore.appendMessage()` 会额外保存 `kind/queueControl/executionControl`，`appAssistantPanel.restoreConversation()` 可据此恢复最近队列控制引用；Slice 219 后，`queueControlReferencesFromMessages()` 会从同一本地 conversation 的 `queueControl.executionId/executionIds` 重建最近 4 个引用，并让 `restoreConversation()` 同时恢复 `state.recentQueueControlReferences` 与 `state.lastQueueControlReference`。 | Project Execution Store 仍是项目级执行存储，不应塞进旧 conversation store 后假装完成；`queueControl/executionControl` 只用于聊天/澄清/最近引用恢复，不等于完整执行历史。后端会话消息 metadata 的跨设备同步尚未作为已验收能力。 |
| 当前执行存储 | `modules/assistant/assistantExecutionStore.js` 已新增前端项目级 store：支持 `executions/queue/timeline/drawerState`、项目隔离、`maxExecutions` 裁剪、敏感字段和本地路径清洗，并已新增 `importExecutions()` 导入后端历史；`sanitizeTimelineEvent()` 已把 timeline 的 `nodeIds/affectedNodeIds/createdNodeIds/updatedNodeIds/queuedGenerationNodeIds/startedGenerationNodeIds` 归一成去重 `nodeIds`，供抽屉详情聚焦；`orchestratorState` 已在前端本地持久化 `nextActionIndex/pausedAtActionId/running`，且非 executing 状态不会保留 `running=true`；Slice 180 后，前端 store 和后端 service 读取到遗留 `executing` 时会恢复为 `paused`、保留 cursor、追加 `restored_paused` 并持久化；`AssistantExecutionStatus.QueuedDraft="queued_draft"` 已存在，`snapshot().queue`、队列排序、置顶/暂停/继续/取消均同时识别 `queued` 与 `queued_draft`；Slice 177 后，`moveQueuedExecutionToTop()` 的重排列表已改为 `isQueueStatus(execution.status)`，混合多个 draft 时会保留其它队列项相对顺序；`appAssistantPanel.js` 已能把 v2 response 写入 store/后端，执行中新增 v2 response 默认保存为 `queued_draft`，抽屉已展示收起态、展开态计划/时间线、队列横条和详情；`assistantExecutionOrchestrator.js` 已完成逐 action 调度、pause/resume、retry/skip、dependency_blocked、视频 retry 授权安全门、Timeline Humanizer 最小切片，并在 Slice 169-180 后支持队列自动拉起前 `prepareQueuedExecution` 成功刷新与失败 fail-closed；Slice 175 后，`queued_draft` 轮到执行前强制 prepare，且必须拿到 fresh `actionsByStep` 才晋级 `queued` 并执行，否则 fail-closed；后端 `CanvasAgentExecutionService` 与 `/api/v2/canvas-agent/executions/*` 已完成 list/get/upsert/append-timeline/update-status/clear-completed，并在 Slice 149 持久化 `orchestratorState` 与 timeline 扩展字段；Slice 166 后，后端也会持久化 `drawerState.queuePaused`，支持 `control_queued_execution()` 与 `/queue-control`，前端 `controlQueuedExecution()` 和抽屉 queued 控制会 best-effort 同步，后端 queued 列表按 `queueIndex` 返回；Slice 172 后，execution API client 与后端 `/prepare` thin boundary 已存在；Slice 173 后，主浏览器 `createCanvasAgentApi()` 也已暴露 `prepareQueuedExecution()`；Slice 174 后，默认 server prepare runner 已接入 `PI_BRIDGE_SERVICE.chat(mode="actions")` 编译链路；Slice 175 后，后端 `_QUEUE_STATUSES` 同时包含 `queued/queued_draft`，`prepare_queued_execution()` 只在 fresh actions 存在时把 draft 晋级为 `queued`。 | 这仍不是完整执行工作台；队列能力已完成前端/后端最小同步闭环、Orchestrator prepare hook、prepare 失败 fail-closed、默认 app latest context + 显式 prepare API boundary、主浏览器 API prepare 暴露、可注入 runner 的后端 prepare thin boundary、默认 server prepare runner wiring、`queued_draft` 最小状态机、混合 queued/draft 置顶排序修复和跨重启安全暂停；自然语言控制完整语义版、真实 8777 live 联调、失败/视频授权/依赖恢复联动、完整跨重启冲突策略、完整依赖重编译/结果合并、关闭总结后的完整历史浏览入口、完整 Timeline Humanizer 词库和 Undo/Replay 尚未完成。 |
| 当前 prepare 失败分类 | Slice 179 后，`modules/assistant/assistantExecutionOrchestrator.js::failPrepareClosed()` 会给 `prepare_failed` timeline event 写入 `developer.prepareErrorKind` 和 `developer.prepareErrorMessage`；已覆盖 `missing_prepare_hook`、`prepare_threw`、`invalid_prepare_result`、`missing_fresh_actions`。 | 这是前端 Orchestrator 的 live-safe 离线诊断闭环；不等于后端 `/prepare` route、真实 `8777` live runner 或 UI 错误中文化全部完成。 |
| 当前跨重启恢复 | Slice 180 后，`modules/assistant/assistantExecutionStore.js` 在本地 storage 读取或后端 `importExecutions()` 导入时，会把遗留的 `executing` execution 安全恢复为 `paused`；`services/canvas_agent_execution_service.py` 在 storage reload 时也会执行同样的安全暂停。两端都会保留 `nextActionIndex/pausedAtActionId`，清空 `running`，追加 `restored_paused` timeline event，并保持 queued/queued_draft 队列顺序。 | 这是前端/后端 store 的重启安全暂停最小闭环；不等于完整跨重启自动续跑、画布变更冲突检测、后端一致性租约或 Undo/Replay。 |
| 当前多 Agent 编排 | `modules/assistant/assistantAgentOrchestrator.js` 已有 storyboard/prompt/layout/generation/qa 角色、最小权限校验、视频授权拦截和 handoff plan 构建测试。 | 它是角色/权限计划器，不是本 PRD Phase 3 的 Execution Orchestrator；不能用它假装已经实现逐步执行、暂停、重试、timeline、Undo/Replay。 |
| 当前 API 命名空间 | 真实主链路由 `services/canvas_agent_route_service.py` 和 `services/http_route_dispatcher.py` 使用 `/api/v2/canvas-agent/*`；`ClawAssistantRouteService` 内有 `/api/v2/assistant/*`，但接力开发前必须确认它在当前启动路径是否被 dispatcher 暴露。 | 计划/时间线 execution API 主线使用 `/api/v2/canvas-agent/executions/*`；不要凭空写 `/api/v2/assistant/executions/*` 除非同步补 dispatcher 和测试。 |
| 8777 服务协作 | 接力文档已明确：开发者不主动启动、重启、停止、检查或探测 `8777`。 | PRD 的开发、联调和验收章节必须保留该规则；需要服务就绪时停下来交给用户处理。 |

### 2.2 当前实现进度快照（按真实代码核验）

| 切片 | 状态 | 已验证事实 | 仍缺口 |
|---|---|---|---|
| Slice 120：Claw v2 loader | 已完成 | `ClawSkillRegistryService` 支持 `v2_skill_dir`、旧字段迁移、v2 覆盖旧 skill；相关 Python unittest 已通过。 | 项目级 override 顺序和开发者迁移提示还未做。 |
| Slice 121：内置 v2 核心场景 Skills | 已完成 | 4 个 v2 场景 skill 已落地，默认 registry 能命中“整理画布/预设生成/资产使用/分镜工作流”。 | 后续可扩展质量断言和 fixture 模拟。 |
| Slice 122：PI Skill Adapter helper | 已完成 | `huanyingTools.ts/js` 可读取 v2 skills 并拼进 prompt；Node 回归通过。 | 已被 Slice 124 接入真实 PI 请求。 |
| Slice 123：Canvas Skills Adapter | 已完成最小闭环 | `canvasSkillIdsForV2Skill()` / `canvasSkillCallsForV2Skill()` 已把 v2 preset/generation/asset skill 映射到现有 Canvas Skills stable id，并从 `canvasSkills/index.js` 与旧 `assistantCanvasSkillRegistry.js` 导出；Node 测试已通过。 | 只完成 adapter 映射，不代表 timeline trace、Orchestrator 或视频安全债已完成。 |
| Slice 124：PI 默认 v2 skill 加载 | 已完成 | `piClient.ts/js` 已默认加载 `config/assistant-skills-v2` 并把 skills 传入 `buildCanvasAgentSystemPrompt(mode, { skills })`；真实 completion prompt 测试含 `Unified Skill Registry v2`。 | 后续只需要 execution store/timeline 消费，不再是 prompt 注入缺口。 |
| Slice 125：Assistant Response Contract v2 | 已完成最小透传 | `assistantProtocol.js`、PI `protocol.ts/js`、`piClient.ts/js`、`pi_bridge_service.py`、`claw_bridge_service.py` 已保留并清洗 `intent/plan/actionsByStep/execution/developer`；旧 actions 会包成最小 v2 plan；相关 Node/Python 回归通过。 | 前端 `Project Execution Store` 和输入框上方只读抽屉已消费这些字段；后端 Project Execution Store/route 已可接收 execution 记录，且前端已能尽力写入后端；Orchestrator 已消费 v2 plan/actionsByStep 做逐 action 调度；Undo/Replay 尚未消费。 |
| Slice 126：v2 Skill Offline Runner | 已完成最小闭环 | `services/assistant_skill_v2_offline_runner.py` 与 `tools/run_assistant_skill_v2_offline_tests.py` 已执行 4 个内置 `tests.json`，4/4 通过。 | 当前只验证 skill 命中，尚未做 allowedActions/forbiddenActions/qualityRules 深度断言。 |
| Slice 127：Act 模式视频授权安全债 | 已完成最小闭环 | `appAssistantPanel.js` 不再因 Act 自动授权视频；`assistantInteractionCards.js` 区分“视频草稿节点”和“真实视频生成任务”；`assistantActionPreviewModel.js` 在 Act 视频生成时仍要求显式授权；`canvasSkills/registry.js` 在 Act 下仍确认视频 skill；Node 回归通过。 | Orchestrator 已在 v2 授权视频、视频 retry 和 selected video timeline event 授权路径复用显式授权原则；后续后端执行链路和 dependency_blocked 恢复路径仍要重复校验视频授权。 |
| Slice 128：前端 Project Execution Store | 已完成最小闭环 | `modules/assistant/assistantExecutionStore.js` / `.test.js` 已存在；支持项目级 snapshot/list/get、create/enqueue、status update、timeline event、clearCompleted、敏感字段清洗、项目隔离和本地存储 key `huanying.canvasAgent.executions.v1`。 | 已被 Slice 129 接入 `appAssistantPanel.js` 的 v2 response 写入路径；抽屉 UI、后端 route、前端 API 尽力同步和 Orchestrator 状态推进已进入最小闭环，完整历史浏览入口仍待做。 |
| Slice 129：appAssistantPanel 写入 Execution Store | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 接收 `executionStore` 注入；非流式和流式最终 response 均调用 store 创建 execution；`modules/app/appAssistantPanel.test.js` 覆盖 v2 response 创建 execution、保留 plan/actionsByStep、追加 timeline，并由 store 脱敏 developer payload。 | 已被 Slice 130 的收起态抽屉读取；后端同步和 Orchestrator 逐步调度已完成最小闭环。仍缺完整历史浏览入口、Timeline Humanizer 和 Undo/Replay。 |
| Slice 130：输入框上方收起态执行抽屉 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 默认创建/接收 `executionStore`，在 compose 内输入区上方渲染 `.hy-canvas-agent-execution-drawer`；`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖 visible execution 显示两行状态、展开按钮和确认按钮，并验证位于输入框上方。 | 已被 Slice 131 扩展为只读展开态；后续 Slice 145/147/148/150/154/155/158 已把 v2 暂停/继续/确认/授权视频/重试、selected-event 重试/跳过/视频授权接入 Orchestrator。当前仍缺完整依赖重编译/结果合并、完整历史入口、完整 Humanizer 和 Undo/Replay。 |
| Slice 131：展开态只读计划/时间线 | 已完成最小闭环 | `.hy-canvas-agent-execution-expand` 点击后切换 `aria-expanded=true`，显示 `hy-canvas-agent-execution-plan` 和 `hy-canvas-agent-execution-timeline`；测试覆盖 plan steps 和 timeline humanSummary 渲染。 | 已被 Slice 138 补上任务队列横条和时间线详情文本，并由 Slice 141 补上时间线滚动策略最小闭环；编辑/重排仍待做。 |
| Slice 132：抽屉“授权视频”按钮 | 已完成最小闭环 | `.hy-canvas-agent-execution-action` 在 `waiting_video_authorization` 状态显示“授权视频”，点击后走现有 `state.approveVideoGeneration()` + `handleApply()` 路径；测试验证 `validateActions` 和 `executeActions` 都收到 `videoAuthorized=true`，并清空 pending actions。 | 这是旧 `pendingActions` 兼容路径的授权入口；v2 execution 已由 Slice 148 接入 Orchestrator，重试已由 Slice 150 接入 Orchestrator，视频 retry 安全门已由 Slice 151 补上。 |
| Slice 133：PRD v2.1 真实代码修复 | 已完成文档切片 | PRD 已按真实代码修正“抽屉仍未消费 store/尚未接入 UI”的过期表述；接力文档已记录真实代码锚点。 | 文档切片，不改变运行时。 |
| Slice 134：抽屉视频待确认文案安全 | 已完成最小闭环 | `drawerActionLabel()` 在待确认/草稿状态发现 pending actions 中存在未授权 `ai-video` 的 `queue_generation_task` 或 `run_prompt_preset_generation` 时，优先显示“授权视频”；测试覆盖普通非视频“确认”不会传 `videoAuthorized`，以及视频待确认不会显示普通“确认”。 | 仅修正抽屉条件按钮文案和安全入口；v2 授权视频和重试已接入 Orchestrator，旧 interaction card 确认流仍是兼容路径。 |
| Slice 135：后端 Project Execution Store / Route | 已完成最小闭环 | `services/canvas_agent_execution_service.py` 后端 Project Execution Store 已支持 list/get/upsert/append-timeline/update-status/clear-completed，并在 Slice 149 后持久化 `orchestratorState` 与 timeline `nodeIds/error/canRetry/canUndo/durationMs`，同时继续脱敏 secret/local path；Slice 166 后 `_sanitize_drawer_state()` 已保留 `queuePaused`，`control_queued_execution()` 支持 `top/pause/resume/cancel`，`list_executions(status=queued)` 会按 `queueIndex` 返回队列顺序。 | 后续重点是完整历史浏览入口、后端执行链路视频授权 parity、完整依赖重编译/结果合并、自然语言控制完整语义版、完整队列失败/视频/依赖联动和 undo/replay 语义；不再把扩展字段持久化、队列控制后端同步、Orchestrator-backed `重试`、selected-event `跳过`、selected video event `授权视频`、`dependency_blocked` 或 `queued_draft` 最小状态机当成未完成项。 |
| Slice 136：PRD v2.4 真实代码边界修复 | 已完成文档切片 | PRD 已按 Slice 135 后的真实代码修正“后端 execution store/route 仍待做”的过期表述；接力文档已记录。 | 文档切片，不改变运行时。 |
| Slice 137：前端 Execution API 同步 | 已完成最小闭环 | 新增 `modules/assistant/assistantExecutionApiClient.js` / `.test.js`；`appAssistantPanel.js` 收到 v2 response 后先写本地 `assistantExecutionStore`，再通过 `/api/v2/canvas-agent/executions` upsert execution 元信息，并通过 `/timeline` append 初始 timeline event；后端失败时保留本地记录并写 `lastExecutionSyncError`；相关 Node 回归 87 tests OK。 | 这是尽力同步，不是 Orchestrator；持续执行进度、pause/resume/retry、历史入口、Undo/Replay 仍待做。 |
| Slice 138：展开态队列横条与时间线详情 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `executionSnapshotForDrawer()`、`queueStatusText()`、`renderExecutionQueueStrip()`、`timelineEventDetailText()` 和 `executionDrawerSelectedEventId`；展开态渲染 `.hy-canvas-agent-execution-queue`、`.hy-canvas-agent-execution-side`、`.hy-canvas-agent-execution-event-detail`；`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖队列横条、当前/排队状态、点击 timeline event 后详情显示 summary、stepId、actionId、duration、可重试/可撤销。 | 这是只读 UI 最小闭环；已由 Slice 140 补上队列卡片点击切换查看，由 Slice 141 补上时间线滚动策略，由 Slice 142 补上“聚焦对象”详情按钮，由 Slice 154/155/158 补上 selected-event 重试/跳过/视频授权。timeline undo、完整历史浏览入口、开发者详情和 Undo/Replay 仍待做。 |
| Slice 139：后端 execution 历史加载到前端抽屉 | 已完成最小闭环 | `assistantExecutionApiClient.listExecutions(filters)` 会 GET `/api/v2/canvas-agent/executions?projectId=...`；`assistantExecutionStore.importExecutions()` 可导入同项目 execution 并继续脱敏；`createAppAssistantPanel().init()` 会调用 `state.loadExecutionHistory()`，把后端历史导入 store 后刷新 `.hy-canvas-agent-execution-drawer`，失败时记录 `lastExecutionSyncError` 且不破坏本地抽屉；相关 Node 回归 92 tests OK。 | 这是启动时历史导入，不是完整历史浏览器；还缺关闭总结后的独立历史入口、手动刷新、分页/筛选、后端授权语义呈现和 Undo/Replay。 |
| Slice 140：展开态队列卡片切换查看 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `executionDrawerSelectedExecutionId` 与 `executionForExpandedDrawer()`；`renderExecutionQueueStrip(activeExecution, viewedExecution)` 会给卡片写入 `data-selected`，点击排队卡只切换展开详情所看的 execution 并清空选中 event；计划区和时间线区读取 `detailExecution`；`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖点击排队任务后显示 queued plan/timeline、`data-selected=true`，且 `activeExecutionId` 和 queue 顺序不变；相关 Node 回归 93 tests OK。 | 这是查看态切换，不是执行重排；已由 Slice 141 补上滚动策略，由 Slice 142 补上详情聚焦，并由 Phase 3 Orchestrator 切片补上暂停/继续/确认/授权视频/抽屉级重试、Slice 154 选中事件“重试此步”、Slice 155 选中事件“跳过此步”、Slice 158 选中视频事件“授权视频”、Slice 163 队列较长提示、Slice 164 queued 卡前端本地取消/置顶/暂停/继续和 Slice 175 queued_draft 防陈旧执行。仍缺 undo 详情按钮、完整历史浏览入口、自然语言控制完整语义版、完整队列失败联动和 Undo/Replay。 |
| Slice 141：展开态时间线滚动策略 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `EXECUTION_TIMELINE_SCROLL_PAUSE_MS`、`executionTimelineAutoScrollPaused`、`executionTimelineScrollTopById`、`applyExecutionTimelineScroll()` 和 `pauseExecutionTimelineAutoScroll()`；`.hy-canvas-agent-execution-timeline` 变为可滚动区域，默认滚到底部；用户手动上滚后设置 `data-auto-scroll-paused=true` 并保留当前位置，5 秒后恢复自动滚底；切换队列查看时清空暂停态；`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖自动滚底、手动上滚暂停、追加 timeline 后不抢回底部、计时恢复后重新滚底。 | 这是前端抽屉滚动 UX 最小闭环；Orchestrator 已在 Slice 143/144/145/147/148/150/151/154/155/157/158 分步接入。仍缺完整历史浏览入口、完整依赖重编译/结果合并、完整 Timeline Humanizer 和 Undo/Replay。 |
| Slice 142：时间线详情聚焦对象 | 已完成最小闭环 | `modules/assistant/assistantExecutionStore.js::sanitizeTimelineEvent()` 会在前端本地保留 timeline 中的 `nodeIds` 及常见 affected/created/updated/generation node id 数组并去重；`modules/app/appAssistantPanel.js` 新增 `timelineEventNodeIds()` 与 `focusTimelineEventNodes()`，从 event、developer.actionJson、action 中提取节点 id；展开态选中时间线事件后，如存在节点 id，详情区显示 `.hy-canvas-agent-execution-detail-focus`“聚焦对象”，点击调用 `graphStore.setSelectedNodes(nodeIds)`；`modules/app/appAssistantPanel.p1Ui.test.js` 和 `assistantExecutionStore.test.js` 覆盖前端本地节点 id 持久化与聚焦。 | 这是详情最小操作，只负责前端本地选中/聚焦画布对象；后端历史导入保留 nodeIds，retry/skip 已由 Slice 154/155 接入真实 Orchestrator，undo 仍缺 inverse patch。 |
| Slice 143：Execution Orchestrator 核心首片 | 已完成最小闭环 | 新增 `modules/assistant/assistantExecutionOrchestrator.js` 与 `.test.js`；`createAssistantExecutionOrchestrator()` 接收 `executionStore/validateActions/executeActions/executionSyncClient`，把 v2 `plan.steps` + `actionsByStep` 编译为逐 action 序列；每个 action 写 running/completed/failed timeline event，validation failure 不调用 executor 并标记 execution failed/canRetry；成功时更新 progress/status 到 completed；新增 `assistantExecutionApiClient.updateExecutionStatus()` 走 `/api/v2/canvas-agent/executions/{id}/status` PATCH；测试覆盖逐 action validate/execute、timeline/status 写入、后端 status/timeline 尽力同步、invalid action fail closed。 | 这是 Orchestrator 核心库首片；后续已完成暂停/继续、确认、授权视频、重试、跳过、视频 retry 安全门、最小 timeline 人话化、依赖恢复、队列前端本地最小闭环和 queued_draft 最小状态机。仍缺完整 DAG 重编译/结果合并、队列失败/视频/依赖联动、自然语言控制完整语义版、完整 Timeline Humanizer 词库/错误中文化、Undo/Replay。 |
| Slice 144：Execution Orchestrator pause/resume cursor | 已完成最小闭环 | `modules/assistant/assistantExecutionStore.js` 新增 `orchestratorState` 持久化，保存 `nextActionIndex/pausedAtActionId/running` 并防止非 executing 状态残留 `running=true`；`assistantExecutionOrchestrator.js` 新增 `pause(executionId)` 与 `resume(executionId, options)`；pause 不强杀当前 action，而是在当前 action 完成后写入 paused 状态、progress 和下一 action cursor；resume 从 `orchestratorState.nextActionIndex` 继续执行后续 action；测试覆盖 pause 后只执行当前 action、resume 后继续剩余 action、cursor 持久化。 | 这是 Orchestrator 核心行为；抽屉“暂停/继续”已由 Slice 145 接入。依赖恢复、队列调度和 queued_draft 防陈旧执行均已完成最小闭环；仍缺队列失败/视频/依赖联动、自然语言控制完整语义版、完整 Timeline Humanizer、完整依赖重编译/结果合并和 Undo/Replay。 |
| Slice 145：抽屉暂停/继续接入 Orchestrator | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `executionOrchestrator` 注入参数；无显式注入但存在 `api.validateActions` 与 `executionStore` 时，会默认创建 `createAssistantExecutionOrchestrator()`，并复用现有 `executeActions`、`graphStore`、`templateStore`、`canvasSkillsRuntime`、`executionSyncClient`；`handleExecutionDrawerAction()` 在按钮文案为“暂停”时调用 `orchestrator.pause(execution.id)`，文案为“继续”时调用 `orchestrator.resume(execution.id, { agentMode, videoAuthorized })`；`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖点击抽屉暂停/继续会调用真实 Orchestrator 注入对象并刷新 execution 状态。 | 这是暂停/继续按钮最小接入；后续 Slice 147/148/150/154/155 已继续把确认/授权视频/重试/跳过接入 Orchestrator。依赖恢复、队列调度和 queued_draft 防陈旧执行均已完成最小闭环；仍缺队列失败/视频/依赖联动、自然语言控制完整语义版、完整 Timeline Humanizer、完整依赖重编译/结果合并和 Undo/Replay。 |
| PRD v3.4：真实代码与默会边界修复 | 已完成文档切片 | 已核对 `appAssistantPanel.js`、`assistantExecutionStore.js`、`assistantExecutionOrchestrator.js`、`assistantExecutionApiClient.js`、`canvas_agent_execution_service.py`、`canvas_agent_route_service.py`、`http_route_dispatcher.py` 以及接力文档 Slice 142-145；当时修正 PRD 中容易误判的边界：后端 execution service 还不保留 timeline 拓展字段和 `orchestratorState`，抽屉确认/授权视频/重试当时尚未接入 Orchestrator。 | 文档切片，不改变运行时；这些边界已被后续 Slice 147/148/149/150/151/152/154/155/157/158 改写。当前仍缺计划编辑、DAG 预览、完整 Timeline Humanizer 词库/错误中文化、完整历史浏览入口、完整依赖重编译/结果合并、Undo/Replay。 |
| Slice 147：抽屉非视频确认接入 Orchestrator | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 v2 execution action 收集与可执行判断；`drawerActionLabel()` 同时检查旧 `pendingActions` 和 v2 `actionsByStep`，确保 v2 视频 execution 未授权时显示“授权视频”；`handleExecutionDrawerAction()` 在“确认”且 execution 有 v2 actions、且存在 `executionOrchestrator.run` 时调用 `run(execution.id, { agentMode, videoAuthorized })`，否则才降级旧 `handleConfirmCard()`；`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖非视频 v2 确认调用 Orchestrator、v2 视频 execution 显示授权视频不走普通确认。 | 这是非视频确认最小接入；v2 视频授权已由 Slice 148 继续接入 Orchestrator，抽屉重试已由 Slice 150 接入 Orchestrator；旧 pendingActions 授权仍保留兼容降级。 |
| Slice 148：抽屉 v2 授权视频接入 Orchestrator | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `executionHasUnauthorizedVideoAction()`；`handleExecutionDrawerAction()` 在按钮为“授权视频”时先判断目标 execution 是否为 runnable v2 视频 execution，随后调用 `state.approveVideoGeneration()`，并在 v2 场景调用 `executionOrchestrator.run(execution.id, { agentMode, videoAuthorized:true })`；没有 v2 actions 或没有 Orchestrator 时才降级旧 `handleApply()`；`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖 v2 视频授权后调用 Orchestrator。 | 这是 v2 execution-level 授权接管；后续 Slice 151 已补上视频 retry 未授权时停在待授权，Slice 154/155 已补上 selected-event retry/skip，Slice 158 已补上 selected video event “授权视频”UI。仍缺后端执行链路同等安全门、授权后依赖重编译/结果合并和 Undo/Replay。 |
| Slice 149：后端 execution 扩展字段持久化 | 已完成最小闭环 | `services/canvas_agent_execution_service.py` 新增 `orchestratorState` sanitizer、timeline node id 归一去重、`error/canRetry/canUndo/durationMs` 持久化和 status PATCH 合并；`canvas_agent_execution_service_test.py` 覆盖 upsert、append timeline、update status、落盘重载后字段仍保留且敏感 error 脱敏；Python 相关回归通过。 | 这是后端历史不丢 pause cursor、节点聚焦、重试/撤销门控信息的最小持久化；重试执行已由 Slice 150/154 接入，视频 retry 授权安全门已由 Slice 151 接入，跳过已由 Slice 155 接入。仍缺 Undo inverse patch、完整历史浏览入口和依赖恢复。 |
| Slice 150：抽屉重试接入 Orchestrator | 已完成最小闭环 | `modules/assistant/assistantExecutionOrchestrator.js` 新增 `retry(executionId, options)`，从失败 execution 的 `orchestratorState.nextActionIndex` 或 progress cursor 重新调用 `run()`；`modules/app/appAssistantPanel.js` 在抽屉按钮为“重试”时调用 `resolvedExecutionOrchestrator.retry(execution.id, { agentMode, videoAuthorized })`；测试覆盖核心从失败 action cursor 重跑和 UI 点击调用 retry。 | 这是 failed execution retry 的最小闭环；Slice 151 已补上视频 retry 未授权时停在 `waiting_video_authorization`，Slice 154 已补上 selected-event `actionId` 定位 retry，Slice 158 已补上 selected video event 授权 UI。仍缺完整依赖重编译/结果合并、Undo/Replay。 |
| Slice 151：视频重试授权安全门 | 已完成最小闭环 | `modules/assistant/assistantExecutionOrchestrator.js` 新增 `generationActionNodeType()` / `isVideoGenerationAction()`，`retry()` 在 failed cursor 指向 `queue_generation_task` 或 `run_prompt_preset_generation` 且 nodeType 为 `ai-video`、并且 `options.videoAuthorized !== true` 时，写入 `waiting_video_authorization` timeline event，更新 execution status/progress/orchestratorState，并返回 `requiresVideoAuthorization:true`；`modules/assistant/assistantExecutionOrchestrator.test.js` 覆盖不调用 `validateActions()` / `executeActions()`、cursor 保持在视频 action。 | 这是视频失败重试的安全门；Slice 152 已把待授权 summary 改成中文，Slice 155 已补上 selected-event skip，Slice 158 已补上 selected video event 授权 UI。仍缺后端执行链路同等安全门、依赖恢复授权语义和 Undo/Replay。 |
| Slice 152：Timeline Humanizer 最小切片 | 已完成最小闭环 | `modules/assistant/assistantExecutionOrchestrator.js` 新增 `actionHumanObject()` 与 `timelineSummary()`，对没有人话标题的 `queue_generation_task`、`run_prompt_preset_generation`、`create_node`、`connect_nodes` 等 action 生成中文 `humanSummary`，例如 `正在生成图片` / `已生成图片`；完成态 drawer 文案改为 `执行完成`，暂停改为 `已暂停`，视频 retry 待授权改为 `需要先授权视频生成`；`modules/assistant/assistantExecutionOrchestrator.test.js` 用 RED/GREEN 覆盖普通 timeline 不再出现 `Running:`、`Completed:` 或 `queue_generation_task`，且原始技术 action 仍保留在 `developer.actionJson`。 | 这是 Orchestrator 级最小人话化，不是完整 Humanizer 词库；仍缺更多 action type 覆盖、UI 开发者模式 JSON 面板、历史导入后人话迁移和错误详情中文化。 |
| Slice 153：PRD v3.11 真实代码一致性修复 | 已完成文档切片 | 对照真实代码修正“后端扩展字段仍未持久化”“抽屉重试仍未接 Orchestrator”等过期说法，明确后端 `orchestratorState/nodeIds/error/canRetry/canUndo/durationMs/developer` 已持久化，且抽屉级重试已接入 Orchestrator。 | 文档切片，不改变运行时；不能替代后续 selected-event retry/skip、依赖恢复、完整历史入口或 Undo/Replay。 |
| Slice 154：Timeline 选中事件重试 | 已完成最小闭环 | `modules/assistant/assistantExecutionOrchestrator.js` 新增 `actionIndexById()`，`retry()` 会优先按 `options.actionId` 定位 cursor；`modules/app/appAssistantPanel.js` 展开态选中 `canRetry=true` 且有 `actionId` 的事件时显示“重试此步”，点击传 `actionId/eventId/agentMode/videoAuthorized` 给 Orchestrator；相关 core/UI/回归测试已通过。 | 这是 selected-event retry 的最小闭环；不包含 undo、依赖重编译或重试结果合并；selected-event skip 已由 Slice 155 补上，selected video event 授权 UI 已由 Slice 158 补上。 |
| Slice 155：Timeline 选中事件跳过 | 已完成最小闭环 | `modules/assistant/assistantExecutionOrchestrator.js` 新增 `skip(executionId, { actionId, eventId })`，可按 `actionId` 定位 selected timeline action，追加 `skipped` timeline event，写入 `developer.skippedFromEventId/actionJson`，并推进 `progress` 与 `orchestratorState.nextActionIndex`；`modules/app/appAssistantPanel.js` 新增 `skipTimelineEvent()`，展开态选中 `canRetry=true` 且有 `actionId` 的事件时显示“跳过此步”，点击调用 Orchestrator skip。RED/GREEN 已验证。 | 这是 selected-event skip 的最小闭环；skip 后依赖重编译、Undo inverse patch 和完整结果合并仍待后续切片；selected video event 授权 UI 已由 Slice 158 补上。 |
| Slice 156：PRD v3.15 真实代码一致性修复 | 已完成文档切片 | 对照 `assistantExecutionOrchestrator.js`、`appAssistantPanel.js`、`assistantExecutionStore.js`、`canvas_agent_execution_service.py` 与接力文档 Slice 155，修正 PRD 中仍把 skip 或 generic timeline 单 action 操作当作未完成的过期表述。 | 文档切片，不改变运行时；后续仍需完整依赖重编译/结果合并、完整历史入口、完整 Humanizer、队列状态机和 Undo/Replay；selected video event 授权 UI 已由 Slice 158 补上。 |
| Slice 157：依赖感知失败/跳过恢复 | 已完成最小闭环 | `modules/assistant/assistantExecutionOrchestrator.js` 新增 `dependsOn` 编译、dependency map、transitive blocker 检测；执行中 action validate/execute 失败时，如果计划有依赖边，会写入 failed event，阻塞依赖该失败步骤的后续 action 为 `dependency_blocked`，继续执行无依赖后续 action，最后停在第一个被阻塞 action cursor；`skip()` 跳过上游 action 时，会把依赖该步骤的后续 action 标记为 `dependency_blocked` 并暂停；`modules/assistant/assistantExecutionOrchestrator.test.js` 增加 RED/GREEN 覆盖“失败后无依赖继续、有依赖暂停”和“skip 后依赖步骤阻塞”。相关 114 条 Node 回归通过。 | 这是 dependency-aware recovery 最小闭环；仍不是完整依赖恢复：未做重试/跳过后的 DAG 重编译、结果合并、跨重启后的依赖冲突处理、完整依赖详情（Slice 160 已补最小源事件摘要），也未做 Undo/Replay。 |
| Slice 158：timeline 单 action 视频授权 UI | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增从 selected timeline event 的 `developer.actionJson`/`event.action` 识别未授权视频生成 action 的 helper；展开态详情选中 `queue_generation_task`/`run_prompt_preset_generation` 且 nodeType 为 `ai-video` 的 retryable event 时，隐藏普通“重试此步/跳过此步”，显示 `.hy-canvas-agent-execution-detail-authorize-video`“授权视频”；点击后调用 `state.approveVideoGeneration()`，再执行 `executionOrchestrator.retry(executionId, { actionId, eventId, videoAuthorized:true })`。`modules/app/appAssistantPanel.p1Ui.test.js` 增加 RED/GREEN 覆盖 selected video timeline event 授权。相关 115 条 Node 回归通过。 | 这是前端 selected-event 授权最小闭环；仍需后端执行链路同等安全门、授权后依赖重编译/结果合并、开发者详情和完整历史浏览。 |
| Slice 159：PRD v3.18 真实代码一致性修复 | 已完成文档切片 | 对照 `appAssistantPanel.js`、`appAssistantPanel.p1Ui.test.js`、`assistantExecutionOrchestrator.js`、`assistantExecutionOrchestrator.test.js` 与接力文档，修正仍把 Slice 158 selected video event “授权视频”UI 当作未完成的过期描述，并把 Phase 3、自检、验收边界更新到 v3.18。 | 文档切片，不改变运行时；后续继续补完整依赖重编译/结果合并、完整历史入口、完整 Humanizer、队列状态机和 Undo/Replay。 |
| Slice 160：dependency_blocked 源事件依赖详情 UX | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `blockedTimelineEventsForSource()`、`dependencyBlockedDetailText()` 和 plan step title helper；展开态选中失败/跳过源事件时，会根据同一 execution 内 `dependency_blocked` events 的 `developer.blockedByEventId/blockedByActionId/blockedByStepId` 反查被阻塞步骤，并在 `.hy-canvas-agent-execution-dependency-detail` 显示“后续 N 步依赖这一步：步骤名”；`modules/app/appAssistantPanel.p1Ui.test.js` 增加 RED/GREEN 覆盖 source event detail lists blocked dependent steps。相关 116 条 Node 回归通过。 | 这是依赖恢复 UX 最小闭环；仍需 action 输出级依赖、重试/跳过后的 DAG 重编译、结果合并、跨重启后的依赖冲突处理、Undo/Replay。 |
| Slice 161：PRD v3.20 真实代码/默会知识边界修复 | 已完成文档切片 | 对照 `assistantExecutionStore.js`、`assistantExecutionOrchestrator.js`、`appAssistantPanel.js`、`canvas_agent_execution_service.py` 与既有测试，修正 PRD 中仍可能把目标态误读为已落地的表述：新输入自动排队、队列超过 5 个提示、完成总结手动关闭、完整历史浏览入口、点击外部收起、Undo/Replay 均仍是目标/后续；同时把“当前必须补的后端字段持久化”改为“已落地字段与仍缺字段”。 | 文档切片，不改变运行时；队列调度最小闭环已由 Slice 162 补上；后续优先补队列软背压/取消/置顶/暂停排队、完成总结关闭与历史入口、Undo inverse patch、完整依赖重编译/结果合并。 |
| Slice 162：队列调度最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js::recordAssistantExecutionFromResponse()` 在已有 active execution 且新 v2 response 不是同一个 execution id 时，改用 `executionStore.enqueueExecution()` 入队，并隐藏 queued 抽屉避免抢占当前 active；当时保存为 `queued`，Slice 175 后已升级为 `queued_draft`；`modules/assistant/assistantExecutionOrchestrator.js` 在当前 execution 成功 `completed` 后会从队列中自动拉起下一项；Slice 164 后实际会跳过暂停排队任务；Slice 169 后 Orchestrator 层已有注入式 prepare hook。新增 RED/GREEN：`appAssistantPanel.test.js` 覆盖执行中新 v2 response 入队；`assistantExecutionOrchestrator.test.js` 覆盖当前完成后执行 queued action。相关 118 条 Node 回归通过。 | 这是队列调度最小闭环；队列超过 5 个提示已由 Slice 163 补上，取消/置顶/暂停排队前端本地控制已由 Slice 164 补上，后端同步已由 Slice 166 补上，Orchestrator prepare hook 已由 Slice 169 补上，`queued_draft` 已由 Slice 175 补上。仍缺自然语言控制完整语义版、真实 8777 live 联调、失败/视频授权/依赖恢复的完整联动。 |
| Slice 163：队列较长提示最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `EXECUTION_QUEUE_WARNING_THRESHOLD=5`；当执行中收到新 v2 response 且已有 5 个排队任务时，仍调用 `enqueueExecution()`，同时给新 execution 写入 `drawerState.queueWarning=true`；展开态 `renderExecutionQueueStrip()` 会显示 `.hy-canvas-agent-execution-queue-warning`“队列较长：当前排队 N 个任务，仍会继续排队。”；`modules/app/appAssistantPanel.p1Ui.test.js` 用 RED/GREEN 覆盖 6 个排队任务显示提示、正好 5 个不提示。相关 120 条 Node 回归通过。 | 这是软背压提示；队列取消/置顶/暂停排队已由 Slice 164 补上前端本地最小闭环，Orchestrator prepare hook 已由 Slice 169 补上，`queued_draft` 已由 Slice 175 补上。仍缺自然语言控制完整语义版、真实 8777 live 联调，以及队列失败/视频授权/依赖恢复联动。 |
| Slice 164：队列取消/置顶/暂停排队控制 | 已完成前端本地最小闭环 | `modules/assistant/assistantExecutionStore.js` 新增 `moveQueuedExecutionToTop()`、`pauseQueuedExecution()`、`resumeQueuedExecution()`、`cancelQueuedExecution()`，并让前端 store 的 `drawerState.queuePaused` 参与清洗/持久化；`modules/app/appAssistantPanel.js` 在展开态队列卡片中渲染“置顶/暂停/继续/取消”按钮，操作不打断 active execution；`modules/assistant/assistantExecutionOrchestrator.js` 在成功完成当前任务后自动拉起下一个 queued execution 时会跳过 `drawerState.queuePaused=true` 的任务。新增 RED/GREEN：store 覆盖队列控制不改变 active，UI 覆盖按钮行为，Orchestrator 覆盖跳过暂停排队任务。相关 123 条 Node 回归通过。 | 这是前端本地队列控制最小闭环；后端同步能力已由 Slice 166 补上，Orchestrator prepare hook 已由 Slice 169 补上，`queued_draft` 最小状态机已由 Slice 175 补上。`取消全部排队任务` 已由 Slice 183 补齐；仍缺批量重排、自然语言跨多轮指代、复杂歧义选择，以及失败/视频授权/依赖恢复场景下的完整队列策略。 |
| Slice 165：PRD v3.24 队列后端同步边界修复 | 已完成文档切片 | 对照真实代码明确 Slice 164 只是前端本地最小闭环：当时后端尚未保存 `queuePaused`，也没有 `queue-control` route/client。 | 历史边界已被 Slice 166 运行时代码修正；保留该切片用于解释为什么 v3.24 曾把队列后端同步列为缺口。 |
| Slice 166：队列控制后端同步 | 已完成最小闭环 | `services/canvas_agent_execution_service.py` 已让 `_sanitize_drawer_state()` 保留 `queuePaused`，新增 `_queued_executions()`、`_renumber_queue()` 和 `control_queued_execution(execution_id, action)`，支持 `top/pause/resume/cancel`；`list_executions(status=queued)` 会按 `queueIndex` 返回队列顺序；`services/canvas_agent_route_service.py` 新增 `PATCH /api/v2/canvas-agent/executions/{id}/queue-control`；`modules/assistant/assistantExecutionApiClient.js` 新增 `controlQueuedExecution()`；`modules/app/appAssistantPanel.js` 的 queued 卡按钮在本地 store 成功后会 best-effort 同步后端，暂停态再次点击会同步为 `resume`；Python/Node 相关回归通过。 | 这是队列控制跨后端同步的最小闭环；Orchestrator prepare hook 已由 Slice 169 补上，`queued_draft` 已由 Slice 175 扩展到前后端队列控制。仍缺自然语言控制完整语义版、真实 8777 live 联调、失败/视频授权/依赖恢复策略、收起态队列数量和完整历史/Undo/Replay。 |
| Slice 167：PRD v3.26 真实代码审计修复 | 已完成文档切片 | 当时对照 `assistantExecutionOrchestrator.js`、`assistantExecutionStore.js`、`assistantExecutionApiClient.js`、`appAssistantPanel.js`、`canvas_agent_execution_service.py`、`canvas_agent_route_service.py` 与接力文档，明确真实代码没有 `queued_draft` 状态、没有队列 prepare/recompile hook；自动拉起队列只会选择首个非暂停 queued execution 并按旧 `plan/actionsByStep` 执行。 | 历史边界已被 Slice 169-180 推进：Orchestrator prepare hook、prepare 失败 fail-closed、默认 app latest context + 显式 prepare API boundary、默认 server prepare runner 和 `queued_draft` 最小状态机已存在；但真实 8777 live 联调、自然语言控制完整语义版、失败/视频/依赖联动和 Undo/Replay 仍未完成。 |
| Slice 168：PRD v3.27 二次真实代码/默会知识修复 | 已完成文档切片 | 再次对照 `assistantExecutionOrchestrator.js`、`assistantExecutionStore.js`、`appAssistantPanel.js`、`canvas_agent_execution_service.py`、`canvas_agent_route_service.py`、相关 Node/Python 测试和项目默会规则，修复 PRD 中容易被接力开发误读的表述：Orchestrator 职责表不再混入“剩余工作”列，失败处理明确只是 `dependency_blocked` 最小闭环，右侧详情区明确未实现 undo/开发者 JSON，Phase 4 明确完全未落地，队列重编译测试边界写成下一运行时切片。 | 历史边界已被 Slice 169-180 推进：队列重编译不再是空白，Orchestrator hook、fail-closed、app latest context API boundary、默认 server runner 和 `queued_draft` 最小状态机已完成；但真实 8777 live 联调、完整依赖结果合并和 Undo/Replay 仍未完成。 |
| Slice 169：队列 prepare/recompile Orchestrator 核心 hook | 已完成核心最小闭环 | `modules/assistant/assistantExecutionOrchestrator.js` 新增 `prepareQueuedExecution` 注入；`runNextQueuedExecution()` 在自动拉起首个非暂停 queued execution 前，会读取最新 store execution，调用 hook 并传入 `execution/executionId/context/agentMode/videoAuthorized`；hook 返回 plain object 时会通过 `updateStatus(nextId, queued, patch)` 持久化刷新后的 `plan/actionsByStep/drawerState`，并追加 `status: "prepared"` timeline event；`modules/assistant/assistantExecutionOrchestrator.test.js` 已用 RED/GREEN 覆盖 stale queued action 被 recompiled action 替代执行。 | 这是 Orchestrator 成功路径核心 hook；Slice 170 已补 prepare 失败 fail-closed，Slice 171 已补默认 app latest context + 显式 prepare API boundary，Slice 172 已补 execution client + 后端 prepare thin boundary，Slice 173 已补主浏览器 API prepare 暴露，Slice 174 已补默认 server runner，Slice 175 已补 `queued_draft` 最小状态机。仍不是完整产品闭环：真实 8777 live 联调、自然语言控制完整语义版和 Undo/Replay 仍未完成。 |
| Slice 170：队列 prepare 失败 fail-closed 运行时闭环 | 已完成最小闭环 | `modules/assistant/assistantExecutionOrchestrator.js::runNextQueuedExecution()` 已捕获 `prepareQueuedExecution` 抛错；失败时不会执行 queued stale actions，会写入 `status:"prepare_failed"` timeline event、`canRetry:true`、`canUndo:false`，把 queued execution 置为 `failed`，保留/打开抽屉并把错误写入 `drawerState.line2`，同时清空 `running` 与 active execution id；`modules/assistant/assistantExecutionOrchestrator.test.js` 覆盖 `prepare failure stops queued stale actions`。验证命令：`D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "prepare failure stops queued stale actions"` 已通过。 | 这是安全 fail-closed，不是完整重编译产品；后端 prepare thin boundary 已由 Slice 172 补上，默认 server runner 已由 Slice 174 补上，`queued_draft` fail-closed 已由 Slice 175 扩展。live 8777 联调、自然语言控制完整语义版和完整队列失败/视频/依赖联动仍需后续。 |
| Slice 171：默认 app latest context prepare API boundary | 已完成前端最小闭环 | `modules/app/appAssistantPanel.js` 默认创建 `createAssistantExecutionOrchestrator()` 时，若 `api.prepareQueuedExecution` 存在，会注入 `prepareQueuedExecution`；该 hook 在 queued 自动执行前调用 `buildContext({ graphStore })`，合并 `state.references`、`state.attachments()` 与 `buildAssistantMentionContext(state.mentionBindings)`，再调用 `api.prepareQueuedExecution({ ...payload, context })`；返回 plain object 时会把 prepared patch 与 fresh context 一起交给 Orchestrator，执行时使用最新 context；`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖默认 Orchestrator 使用 latest canvas context、调用 explicit API boundary、保持 `videoAuthorized:false`、并执行 fresh action。 | 这是前端产品路径的显式 API 边界；如果外部 `api.prepareQueuedExecution` 没有实现，则不会凭空重编译。Slice 172 已补独立 execution API client 和后端 `/prepare` thin boundary；Slice 173 已补主 `api/canvasAgentApi.js` 暴露；Slice 175 后 `queued_draft` 会强制要求该 prepare 能力，缺失时 fail-closed。仍缺跨重启队列 prepare 策略和 live 8777 联调。 |
| Slice 172：queued prepare API client + 后端 thin boundary | 已完成薄边界最小闭环 | `modules/assistant/assistantExecutionApiClient.js` 新增 `prepareQueuedExecution(executionId,payload)`，POST `/api/v2/canvas-agent/executions/{id}/prepare`；`CanvasAgentExecutionService` 支持可注入 `prepare_runner`，会把 sanitized payload、existing execution、context、agentMode、videoAuthorized 交给 runner，清洗 runner 返回值并剥离 `context/executionContext` 后持久化 prepared patch；`CanvasAgentRouteService` 新增 `POST /api/v2/canvas-agent/executions/{id}/prepare`，有 runner 时返回 `{success, plan, actionsByStep, drawerState...}`，缺 execution 返回 404，已有 execution 但无 runner 返回 501；focused Node/Python 测试已通过。 | 这是 API/后端薄边界；Slice 173 已补 `api/canvasAgentApi.js::createCanvasAgentApi()` 暴露 `prepareQueuedExecution`，Slice 174 已给默认 `CanvasAgentExecutionService` 注入 prepare runner，Slice 175 已要求 `queued_draft` prepare 必须返回 fresh actions。仍不能把它误判成真实 8777 live 端到端验收；自然语言控制完整语义版和 Undo/Replay 仍未完成。 |
| Slice 173：主浏览器 Canvas Agent API prepare 暴露 | 已完成薄客户端最小闭环 | `api/canvasAgentApi.js::createCanvasAgentApi()` 新增 `prepareQueuedExecution(first, second)`；支持 app payload `{ executionId, context, ... }` 和 `(executionId, payload)` 两种调用形态；会 POST `/api/v2/canvas-agent/executions/{id}/prepare`，保留调用方 payload，并返回后端 prepared patch。RED/GREEN 已覆盖 `api.prepareQueuedExecution is not a function` 的真实缺口、路径编码、JSON body 和返回 `plan/actionsByStep`。 | 这是默认 autoload/browser API 对 Slice 171 app prepare hook 的补齐；Slice 174 已补默认 server prepare runner wiring，Slice 175 已补 `queued_draft` 最小状态机。仍不代表 live 8777 已联调，也不代表自然语言控制完整语义版、完整依赖结果合并和 Undo/Replay 完成。 |
| Slice 174：默认 server prepare runner wiring | 已完成默认后端 runner 最小闭环 | `server.py` 新增 `_prepare_canvas_agent_queued_execution(payload)`，从 queued execution 的 `title/conversationId/plan/actionsByStep` 与 latest `context` 构造重编译请求，调用现有 `PI_BRIDGE_SERVICE.chat(message, context, conversation_id, mode="actions")`，要求只返回 v2 `plan/actionsByStep/developer/reply`，并返回 `plan/actionsByStep/drawerState/summary/developer` prepared patch；`CANVAS_AGENT_EXECUTION_SERVICE` 已注入 `prepare_runner=_prepare_canvas_agent_queued_execution`。新增 `server_canvas_agent_prepare_runner_test.py` 覆盖 runner callable、latest context/会话传递、未授权视频边界文案、developer 脱敏，以及 `/prepare` route 通过 server runner 返回 prepared patch。 | 这是默认 server 到现有 PI/LLM 编译链路的最小接线；Slice 175 后 `queued_draft` 会要求该 runner 返回 fresh actions 才能晋级执行。不代表 live 8777 已联调成功，也不代表自然语言控制完整语义版、完整队列失败/视频/依赖联动、完整依赖结果合并或 Undo/Replay 完成。 |
| Slice 175：queued_draft 最小状态机 | 已完成最小闭环 | `modules/assistant/assistantExecutionStore.js` 新增 `AssistantExecutionStatus.QueuedDraft`，`snapshot().queue`、队列排序和暂停/继续/取消控制同时识别 `queued`/`queued_draft`；`moveQueuedExecutionToTop()` 能找到 draft target，且 Slice 177 后内部重排列表已使用 `isQueueStatus()` 覆盖 mixed queue 顺序；`modules/app/appAssistantPanel.js::recordAssistantExecutionFromResponse()` 在已有 active execution 时把新 v2 response 保存为 `queued_draft`；`modules/assistant/assistantExecutionOrchestrator.js::runNextQueuedExecution()` 对 `queued_draft` 强制要求 prepare，prepare 成功且返回 fresh `actionsByStep` 后才晋级 `queued` 并执行刷新后的 actions；无 prepare、prepare 抛错或只返回 plan/无 fresh actions 都 fail-closed，不执行旧 actions；`services/canvas_agent_execution_service.py` 后端也把 `queued_draft` 纳入 queue 排序/控制，prepare 成功且有 fresh actions 后晋级 `queued`。RED/GREEN 覆盖前端 store、Orchestrator、默认 app 入队和后端 service。 | 这是 `queued_draft` 最小状态机，不代表完整队列产品；混合 `queued_draft` 置顶排序已由 Slice 177 补齐，真实 8777 live 联调、自然语言控制完整语义版、失败/视频/依赖联动、完整依赖结果合并、完整历史浏览、Undo/Replay 仍未完成。 |
| Slice 176：PRD v3.35 真实代码/默会知识复核 | 已完成文档切片 | 本轮未触碰 8777，不启动、不检查、不探测服务；CodeGraph 返回 `database is locked` 后按 AGENTS 规则降级使用 `rg` 与定向读取，复核 `assistantExecutionStore.js`、`assistantExecutionOrchestrator.js`、`appAssistantPanel.js`、`canvas_agent_execution_service.py`、`canvas_agent_route_service.py`、`api/canvasAgentApi.js`、`assistantExecutionApiClient.js` 与相关测试；修正 PRD 中容易把 `queued_draft` 队列控制理解为完整产品态的表述，并把 `moveQueuedExecutionToTop()` 的混合 draft 排序风险列为下一运行时 TDD 切片。 | 文档切片，不改变运行时；该文档切片暴露的 mixed draft 置顶排序缺口已由 Slice 177 修复，prepare 错误分类缺口已由 Slice 179 修复，跨重启安全暂停缺口已由 Slice 180 补最小闭环。后续继续进入自然语言控制完整语义版、完整依赖结果合并、完整跨重启冲突策略或 Undo/Replay。 |
| Slice 177：queued_draft mixed queue top ordering | 已完成最小闭环 | TDD 补充 `assistantExecutionStore: moving queued draft to top preserves mixed queue order`：在 `queued -> queued_draft -> queued -> queued_draft` 混合队列里置顶最后一个 draft，要求 target 保持 `queued_draft`、排到队首，且其它 queued/draft 任务保持原相对顺序；RED 已复现旧实现把非目标 draft 排到最后；`modules/assistant/assistantExecutionStore.js::moveQueuedExecutionToTop()` 已把重排列表从只筛 `AssistantExecutionStatus.Queued` 改为 `isQueueStatus(execution.status)`；focused store 与 Orchestrator queue 回归通过。 | 这是前端 store 队列排序修复，不改变后端控制、live prepare 或自然语言队列能力；真实 8777 live 联调、自然语言控制完整语义版、失败/视频/依赖联动、完整依赖结果合并、完整历史浏览、Undo/Replay 仍未完成。 |
| Slice 178：PRD v3.37 真实代码/默会知识修复 | 已完成文档切片 | 本轮未触碰 8777，不启动、不检查、不探测服务；CodeGraph 仍返回 `database is locked`，因此使用 `rg`、定向读取和接力文档复核真实代码。已核对 `assistantExecutionStore.js`、`assistantExecutionOrchestrator.js`、`appAssistantPanel.js`、`canvas_agent_execution_service.py`、`canvas_agent_route_service.py`、`api/canvasAgentApi.js`、`assistantExecutionApiClient.js`、`server.py` 与当前 PRD/接力文档，修复 PRD 中把已落地的 `queued_draft`、mixed queue 置顶排序、prepare/recompile 最小闭环误写成未实现的残留表述。 | 文档切片，不改变运行时；该文档切片暴露的 live-safe prepare 错误分类缺口已由 Slice 179 运行时代码修复。 |
| Slice 179：live-safe prepare 错误结构化分类 | 已完成最小闭环 | `modules/assistant/assistantExecutionOrchestrator.js::failPrepareClosed()` 已在 `prepare_failed` timeline event 的 `developer` 中写入 `prepareErrorKind` 与 `prepareErrorMessage`；focused tests 覆盖 `missing_prepare_hook`、`prepare_threw`、`invalid_prepare_result`、`missing_fresh_actions` 四类，确保 queued/queued_draft 不会静默执行陈旧 actions。 | 这是前端 Orchestrator 的离线安全分类，不等于真实 8777 live runner 全链路错误中文化；跨重启安全暂停已由 Slice 180 补最小闭环，但自然语言控制完整语义版、完整依赖结果合并、完整历史浏览、Undo/Replay 仍未完成。 |
| Slice 180：跨重启执行安全暂停最小闭环 | 已完成最小闭环 | `modules/assistant/assistantExecutionStore.js` 新增重启恢复保护：读取 local storage 或导入后端历史时，如果 execution 仍是 `executing`，会恢复为 `paused`，保留 cursor，写入 `restored_paused` timeline，抽屉显示“重启后已暂停，可继续执行”；`services/canvas_agent_execution_service.py` 在 storage reload 时做同样恢复并持久化；`assistantExecutionStore.test.js` 覆盖本地重启恢复、后端导入恢复、队列顺序保留和重复恢复不重复追加事件，`canvas_agent_execution_service_test.py` 覆盖后端 storage reload 恢复。 | 这是前端/后端 store 级安全恢复，避免僵尸 executing 卡住队列；不等于自动续跑、后端租约/锁、画布变更冲突检测、完整队列失败策略或 Undo/Replay。 |
| Slice 181：PRD v3.40 真实代码/默会知识修复 | 已完成文档切片 | 本轮未触碰 `8777`；CodeGraph 仍为 `database is locked`，改用 `rg` 和定向读取核对 `modules/app/appAssistantPanel.js`、`modules/assistant/assistantExecutionStore.js`、`modules/assistant/assistantExecutionOrchestrator.js`、`services/canvas_agent_execution_service.py` 与当前 PRD/接力文档。已把方案 B 的目标态与真实已落地能力重新拆开：抽屉位置、两按钮、只读计划/时间线、队列横条、滚动策略和 selected-event 操作属于最小闭环；聊天区覆盖/模糊、点击外部收起、完成总结关闭、可编辑计划板/DAG、自然语言控制完整语义版、完整历史入口、完整跨重启冲突策略和 Undo/Replay 仍未完成；自然语言单项队列控制与 `取消全部排队任务` 已由 Slice 182/183 部分收口。 | 文档切片，不改变运行时代码；当时建议的自然语言队列最小拦截已由 Slice 182/183 完成。后续运行时切片应继续补复杂局部批量交换、多轮指代、复杂歧义选择与 live 8777 验收。 |
| Slice 182：自然语言队列控制最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增本地队列控制解析与 `applyNaturalLanguageQueueControl()`：在 `sendMessage()` 进入模型配置 guard、`api.chat/chatStream` 要求和 LLM 请求前，识别“取消第一个排队任务 / 把第二个任务置顶 / 暂停下一个任务 / 继续暂停任务”等本地队列指令；命中后直接调用 `executionStore.cancelQueuedExecution()`、`moveQueuedExecutionToTop()`、`pauseQueuedExecution()`、`resumeQueuedExecution()`，并复用 `executionSyncClient.controlQueuedExecution()` 做后端 best-effort 同步；会追加 user/assistant 反馈消息、写入 `lastReceipt/lastReceiptDetails/lastResponse`，且 `canSendMessage(message)` 会让这类本地命令在无模型配置时仍可点击发送。`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖 cancel/top/pause/resume、模型配置缺失时仍可发送、不会误把“取消当前任务”或“取消第一个节点”当作队列控制；`modules/app/appAssistantPanel.test.js` 同步修正 `queued_draft` 与重启安全暂停的真实断言。 | 这是自然语言队列控制的本地最小闭环；`取消全部排队任务` 已由 Slice 183 补齐。仍不是完整语义调度器：批量重排、跨多轮指代、复杂歧义选择、失败/视频/依赖联动策略或真实 8777 live 验收仍未完成。 |
| Slice 183：自然语言取消全部排队任务 | 已完成最小闭环 | `modules/app/appAssistantPanel.js::parseNaturalLanguageQueueControl()` 会把包含 `全部/所有/全都/all` 的取消排队指令识别为 `cancel_all`；`applyNaturalLanguageQueueControl()` 会遍历当前 queued/queued_draft，逐个调用 `executionStore.cancelQueuedExecution(id)`，保留 active execution，不进入模型 guard 或 LLM 调用，并对每个取消项 best-effort 调用后端 `controlQueuedExecution(id,"cancel")`；反馈消息写入 “已取消 N 个排队任务。”，`lastResponse.queueControl` 记录 `action:"cancel_all"` 与 `executionIds`。`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖 `取消全部排队任务` 不调用 LLM、绕过缺模型 guard、同时取消 queued/queued_draft、保留 active、逐项同步后端。 | 这是批量取消最小闭环，不是完整自然语言队列语义：复杂局部批量交换、多轮指代、复杂歧义选择、失败/视频/依赖联动策略和 live 8777 验收仍未完成。 |
| Slice 184：PRD v3.43 真实代码/默会知识修复 | 已完成文档切片 | 本轮未改运行时代码、未触碰 `8777`；CodeGraph 仍返回 `database is locked`，按 AGENTS 规则降级为 `rg` 与定向读取。已核对 `appAssistantPanel.js` 的 `parseNaturalLanguageQueueControl()`、`applyNaturalLanguageQueueControl()`、`canSendMessage()`、`sendMessage()`，以及 `appAssistantPanel.p1Ui.test.js` 中自然语言单项队列控制、`cancel_all`、缺模型配置绕过和误判防护测试；同步复核 `assistantExecutionStore.js` 的 queued/queued_draft 队列控制与 `assistantExecutionOrchestrator.js` 的 pause/resume/prepare 边界。 | 修复 PRD 中把自然语言队列控制整体写成未完成、阶段总结漏写 Slice 183、或把“完整语义版”与“最小本地闭环”混在一起的过期表述；当时仍未完成自然语言复杂局部复杂局部批量交换、多轮指代、复杂歧义选择、完整失败/视频/依赖队列策略、live 8777 验收、完整历史、Undo/Replay。 |
| Slice 185：自然语言当前任务暂停/继续最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `parseNaturalLanguageActiveExecutionControl()`、`activeExecutionControlExecution()`、`activeExecutionControlReply()` 与 `applyNaturalLanguageActiveExecutionControl()`；`sendMessage()` 会先解析“暂停当前任务 / 继续当前任务”等当前 active execution 控制命令，命中后在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前直接调用 `state.executionOrchestrator.pause(id)` 或 `state.executionOrchestrator.resume(id, { agentMode, videoAuthorized })`；`canSendMessage(message)` 也允许这些本地命令在缺模型配置时可点击发送。`createAssistantPanelState()` 增加 `executionOrchestrator` 注入和 `setExecutionOrchestrator()`，`createAppAssistantPanel()` 会把默认/注入的 Orchestrator 回填给 state。`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖缺模型配置时“暂停当前任务/继续当前任务”不调用 LLM、正确调用 Orchestrator、保留 `videoAuthorized:false`，并继续验证“暂停下一个任务”仍走 queued 控制。 | 这是当前 active execution 暂停/继续的受控关键词本地控制闭环；“取消当前任务”已由 Slice 186 补齐。仍缺复杂局部批量交换、多轮指代、复杂歧义选择、失败/视频/依赖联动策略、真实 8777 live 验收、完整历史、Undo/Replay。 |
| Slice 186：自然语言取消当前任务最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 将 active execution 控制解析扩展到 `cancel`；`sendMessage()` 与 `canSendMessage(message)` 会在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前识别“取消当前任务”；优先调用 `state.executionOrchestrator.cancel(id,{ agentMode, videoAuthorized })`，缺 Orchestrator 时 fallback 到 `executionStore.updateStatus(id,"cancelled",...)`；`modules/assistant/assistantExecutionOrchestrator.js` 新增 `cancelRequests` 和 `cancel(executionId)`，运行中 cancel 在当前 action 完成后写入 `cancelled` timeline/status、清空 `running`，并且不会自动拉起 queued/queued_draft；非运行但可取消的 draft/paused/failed/waiting 状态可直接转为 cancelled。`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖缺模型配置时“取消当前任务”不调用 LLM、不误伤 queued；`modules/assistant/assistantExecutionOrchestrator.test.js` 覆盖 cancel stops after current action and keeps queued work。 | 这是当前 active execution 取消的本地最小闭环，不是生成任务底层强杀能力；已发起 action 不会被强杀，而是在 action 返回后停止后续 action。仍缺复杂局部批量交换、多轮指代、复杂歧义选择、完整队列失败/视频/依赖联动、真实 8777 live 验收、完整跨重启冲突策略、Undo/Replay。 |
| Slice 187：PRD v3.46 真实代码/默会知识修复 | 已完成文档切片 | 本轮未改运行时代码、未触碰 `8777`；CodeGraph 当前返回 `CodeGraph not initialized for this project. Run 'codegraph init' first.`，因此按 AGENTS 规则降级为 `rg` 与定向读取。已核对 `appAssistantPanel.js` 的自然语言队列/当前任务 parser、`assistantExecutionOrchestrator.cancel()`、执行抽屉渲染和相关 UI tests，修正 PRD 对广义“取消任务/取消全部任务”的误读：当前只支持带明确作用对象的受控命令。 | 这是纯文档修复；复杂局部批量交换、多轮指代、复杂歧义选择、完整历史入口、完整依赖结果合并、真实 8777 live 联调、Undo/Replay 仍未完成。 |
| Slice 188：自然语言任务控制歧义确认最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增/接入 `parseNaturalLanguageAmbiguousExecutionControl()`、`ambiguousExecutionControlReply()`、`applyNaturalLanguageAmbiguousExecutionControl()`；`canSendMessage(message)` 和 `sendMessage()` 会在模型配置 guard、`api.chat/chatStream` 与 LLM 调用前识别 `取消任务`、`暂停任务`、`继续任务` 等缺少作用对象的 broad task-control 命令，返回“当前任务还是排队任务”的澄清，不改 active/queued 状态，写入 `executionControl.action:"clarify"`、`requestedAction`、`status:"needs_clarification"`。同时把 queue hint 从 broad `暂停任务` 收窄到 `暂停的任务`，避免误把 `暂停任务` 当成队列暂停。Focused UI 测试覆盖 cancel/pause/resume broad 命令不调用 LLM、不绕过用户澄清、不改变当前和排队任务状态；队列 `继续暂停的任务` 仍保持原行为。 | 这是首轮歧义澄清，不是完整确认工作流；Slice 188 当时尚缺可点击确认按钮，已由 Slice 190 补齐按钮最小闭环。latest-message 澄清上下文历史恢复已由 Slice 193 补齐最小闭环；当前仍缺复杂多轮选择、复杂局部批量交换、多轮指代、完整队列失败/视频/依赖联动、真实 8777 live 验收、Undo/Replay。 |
| Slice 189：歧义澄清后二次回答执行最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `parsePendingExecutionControlClarification()`、`clarifiedQueueControlCommand()`，并在 state 中保存 `pendingExecutionControlClarification`；`canSendMessage(message)` 会允许澄清后的 `当前任务/排队任务` 短回答绕过缺模型配置；`sendMessage()` 在 LLM guard 前调用 `applyPendingExecutionControlClarification()`，复用现有 active/queue 控制函数执行原请求动作。Focused UI 测试覆盖 `取消任务 -> 当前任务` 会调用当前 active execution 的 cancel 且不误伤 queued，`暂停任务 -> 排队任务` 会暂停第一个 queued execution 并同步 queue-control，两个路径均不调用 LLM。 | 这是短回答二次执行最小闭环；澄清卡片状态禁用/完成态已由 Slice 192 补最小闭环，latest-message 澄清上下文历史恢复已由 Slice 193 补齐最小闭环；仍缺跨设备/后端消息更新、更复杂表达解析、复杂局部批量交换、多轮复杂指代、完整队列失败/视频/依赖联动、真实 8777 live 验收、Undo/Replay。 |
| Slice 190：歧义澄清卡片按钮最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `executionControlClarificationCard()`，`applyNaturalLanguageAmbiguousExecutionControl()` 会在 assistant message 上挂载 `execution_control_clarification` card；`renderInteractionCard()` 新增该 card 类型，渲染 `.hy-canvas-agent-clarify-current` 与 `.hy-canvas-agent-clarify-queue` 两个按钮；`createAppAssistantPanel()` 新增 `handleClarificationCard()`，按钮点击后调用 `state.sendMessage("当前任务"|"排队任务")`，继续走 Slice 189 的 pending clarification 执行路径。Focused UI 测试覆盖 `取消任务` 后点击“当前任务”取消 active 且不误伤 queued，`暂停任务` 后点击“排队任务”暂停第一个 queued 并同步 queue-control。 | 这是可点击澄清最小闭环；卡片状态禁用/完成态已由 Slice 192 补最小闭环，latest-message 澄清上下文跨 reload/history 恢复已由 Slice 193 补最小闭环；仍缺跨设备/后端消息更新、更复杂表达解析、复杂局部批量交换、多轮复杂指代、完整队列失败/视频/依赖联动、真实 8777 live 验收、Undo/Replay。 |
| Slice 191：PRD v3.50 真实代码/默会知识复核 | 已完成文档切片 | 本轮未改运行时代码，未触碰 `8777`；先尝试 CodeGraph，MCP 返回 `CodeGraph not initialized for this project. Run 'codegraph init' first.`，且工作区存在 `.codegraph/codegraph.db` 与 `.codegraph/codegraph.db.lock`，因此降级为 `rg`、定向读取真实代码和离线测试/文档一致性校验。已复核 `appAssistantPanel.js` 的 broad 命令澄清、短回答执行、卡片按钮执行链路，以及 `appAssistantPanel.p1Ui.test.js` 的 current/queue card focused 覆盖。 | 这是纯文档边界修复：明确 Slice 190 的按钮执行已完成最小闭环，旧历史行中“当时尚缺按钮”只代表 Slice 188 时点；卡片完成/禁用态已由 Slice 192 补最小闭环，latest-message 澄清上下文跨会话恢复已由 Slice 193 补最小闭环；当前仍缺复杂多轮语义、自然语言复杂局部批量重排、完整队列失败/视频/依赖联动、真实 8777 live 验收、完整历史、Humanizer、依赖结果合并、Undo/Replay。 |
| Slice 192：澄清卡片完成/禁用态最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `latestExecutionControlClarificationCardTarget()` 与 `completeExecutionControlClarificationCard(target)`；`applyPendingExecutionControlClarification()` 在执行 clarified active/queue 控制前，会把最近 `execution_control_clarification` card 更新为 `status:"completed"`、写入 `selectedTarget`，并把 summary 改为“已选择当前任务/排队任务，正在执行对应操作。”；`renderInteractionCard()` 对 completed clarification card 禁用 `.hy-canvas-agent-clarify-current` 与 `.hy-canvas-agent-clarify-queue`，写 `aria-disabled`，并给被选择按钮写 `data-selected="true"`，禁用态按钮不再绑定点击 handler；CSS 增加禁用态透明度和选中描边。 | 这是单卡片选择后的防重复触发/状态反馈最小闭环；latest-message 澄清上下文跨 reload/history 恢复已由 Slice 193 补最小闭环；仍缺复杂多轮语义、自然语言复杂局部批量重排、完整队列失败/视频/依赖联动、真实 8777 live 验收、完整历史、Humanizer、依赖结果合并、Undo/Replay。 |
| Slice 193：澄清上下文历史恢复最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `pendingExecutionControlClarificationFromMessages(messages)`；`executionControlClarificationCard()` 会持久化 `action/all/activeExecutionId/queueCount`；`applyNaturalLanguageAmbiguousExecutionControl()` 现在将同一 clarification card 写入 `conversationStore.appendMessage()`，避免历史消息只剩文本；`restoreConversation()` 会在导入 messages 后，从最后一条仍为 `needs_clarification` 的 `execution_control_clarification` card 重建 `state.pendingExecutionControlClarification`。`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖澄清 card 写入 conversationStore，以及恢复历史后 `当前任务` 可以绕过模型 guard 并继续取消 active execution。 | 这是 latest-message pending clarification 的历史恢复最小闭环；仍缺跨设备/后端消息更新、复杂多轮语义、自然语言复杂局部批量重排、完整队列失败/视频/依赖联动、真实 8777 live 验收、完整历史、Humanizer、依赖结果合并、Undo/Replay。 |
| Slice 194：澄清完成态本地持久回写最小闭环 | 已完成最小闭环 | `modules/assistant/assistantConversationStore.js` 新增 `updateMessageCard(conversationId, cardId, patch)`，可按 card id 更新已保存消息里的 card 并持久化；`modules/app/appAssistantPanel.js::completeExecutionControlClarificationCard()` 在把内存中的 `execution_control_clarification` card 标记为 `completed` 后，会 best-effort 调用 `conversationStore.updateMessageCard()` 回写本地会话；`modules/assistant/assistantConversationStore.test.js` 覆盖 card update 持久化，`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖 `取消任务 -> 当前任务` 后 conversationStore 中的澄清 card 变为 `completed` 且 `selectedTarget:"active"`。 | 这是本地 conversationStore 的 completed card 回写最小闭环；仍缺跨设备/后端消息更新、复杂多轮语义、自然语言复杂局部批量重排、完整队列失败/视频/依赖联动、真实 8777 live 验收、完整历史、Humanizer、依赖结果合并、Undo/Replay。 |
| Slice 195：多个未决澄清自动归档最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `archivePendingExecutionControlClarificationCards()`，在新的 broad 澄清、明确当前任务/排队任务控制或普通对话继续前，会把仍为 `needs_clarification` 的旧 `execution_control_clarification` card 标记为 `archived`，并通过 `conversationStore.updateMessageCard()` best-effort 回写本地持久会话；`renderInteractionCard()` 对非 `needs_clarification` 澄清卡片统一禁用按钮，避免旧卡继续触发。`modules/app/appAssistantPanel.p1Ui.test.js` 覆盖 `取消任务 -> 暂停任务` 时旧卡本地/持久归档、新卡保持待澄清，以及旧归档卡在 UI 中禁用、新卡仍可选择。 | 这是本地多未决澄清归档最小闭环；仍缺跨设备/后端消息更新、复杂多轮语义、自然语言复杂局部批量重排、完整队列失败/视频/依赖联动、真实 8777 live 验收、完整历史、Humanizer、依赖结果合并、Undo/Replay。 |
| Slice 196：自然语言队列指定位置重排最小闭环 | 已完成最小闭环 | `modules/assistant/assistantExecutionStore.js` 新增 `moveQueuedExecutionToIndex(id,targetIndex)`，可在 queued/queued_draft 混合队列中把指定任务移动到目标序号并保持其它队列项相对顺序；`modules/assistant/assistantExecutionApiClient.js::controlQueuedExecution()` 支持第三个 payload 参数；`services/canvas_agent_execution_service.py::control_queued_execution(..., target_index=...)` 与 `/queue-control` route 支持 `action:"move"` + `targetIndex`；`modules/app/appAssistantPanel.js` 新增 `queueControlOrdinalMatches()` 与 `parseQueueMoveCommand()`，能在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前识别“把第四个排队任务移动到第二个”这类 source/target 序数重排，并同步到本地 store 与后端 queue-control。相关 JS/Python focused RED/GREEN 已覆盖。 | 这是“单个队列项移动到指定位置”的自然语言重排最小闭环；仍缺“一句话给出完整队列顺序/多项批量交换/拖拽计划板联动”的完整批量重排、复杂多轮指代、真实 8777 live 验收、完整队列失败/视频/依赖联动、完整历史、Humanizer、依赖结果合并、Undo/Replay。 |
| Slice 197：自然语言队列全量重排最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增/接入 `queueControlOrderIndexes(rawText, queueLength)` 与 `parseQueueReorderCommand(rawText, text, queue)`，当用户给出完整排队序号列表（如 `按 4、2、1、3 的顺序重排整个排队任务`）时，会在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前构造 `orderedIds`；`modules/assistant/assistantExecutionStore.js::reorderQueuedExecutions(orderedIds)` 会按 `orderedIds` 重排 queued/queued_draft 队列、保留各项 status、保留 active execution，并把未列入但仍有效的队列项追加在后；`modules/assistant/assistantExecutionApiClient.js::controlQueuedExecution(...,{ orderedIds })`、`services/canvas_agent_route_service.py` 和 `services/canvas_agent_execution_service.py::control_queued_execution(..., ordered_ids=...)` 支持 `action:"reorder"` 的 best-effort 后端同步。Focused JS/Python tests 覆盖 store、API client、UI bypass LLM、后端 service 和 route。 | 这是“明确完整序数列表 -> 全量队列重排”的自然语言最小闭环；不是复杂局部批量交换、多轮指代式 `按刚才那几个排`、拖拽/可编辑计划板联动、DAG/prepare 重编译联动或 Undo/Replay。真实 `8777` live 联调、完整队列失败/视频/依赖联动、完整历史、Humanizer 和依赖结果合并仍未完成。 |
| Slice 198：自然语言队列两项交换最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `parseQueueSwapCommand(text, queue)`，并让 `parseQueueControlAction()` 识别 `交换/互换/对调/换一下/换个位置/swap`；当用户给出两个明确排队序号（如 `把第二个和第四个排队任务换一下`）时，会在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前生成完整 `orderedIds`，复用 `executionStore.reorderQueuedExecutions(orderedIds)` 重排 queued/queued_draft，保留 active/status，并通过 `controlQueuedExecution(syncId, "reorder", { orderedIds })` best-effort 同步后端。Focused UI RED/GREEN 已覆盖 bypass LLM、active 不变、status 保留和后端 sync payload。 | 这是复杂局部重排的第一片“两项交换”；不是三项及以上局部换位、多轮指代式重排、拖拽计划板联动、DAG/prepare 重编译联动或 Undo/Replay。真实 `8777` live 联调、完整队列失败/视频/依赖联动、完整历史、Humanizer 和依赖结果合并仍未完成。 |
| Slice 199：自然语言队列三项局部重排首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `parseQueueSwapThenMoveLastCommand(text, queue)`；当用户给出 `把第二个和第四个排队任务换一下，再把第三个排到最后` 这类明确三序数表达时，会先交换前两个序数对应队列项，再把最后一个序数对应的原队列项移动到队尾，生成完整 `orderedIds`，在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前复用 `executionStore.reorderQueuedExecutions(orderedIds)` 重排 queued/queued_draft，保留 active/status，并通过 `controlQueuedExecution(syncId, "reorder", { orderedIds })` best-effort 同步后端。Focused UI RED/GREEN 已覆盖错误旧行为 `[1,3,2,4]` 到新目标 `[1,4,2,3]` 的修复。 | 这是“三项局部重排”的首个受控句式，不是任意多步骤局部重排泛化、多轮指代式重排、拖拽计划板联动、DAG/prepare 重编译联动或 Undo/Replay。真实 `8777` live 联调、完整队列失败/视频/依赖联动、完整历史、Humanizer 和依赖结果合并仍未完成。 |
| Slice 200：自然语言队列先移动再当前位置交换最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `parseQueueMoveLastThenCurrentSwapCommand(text, queue)`，并在 `parseNaturalLanguageQueueControl()` 的 reorder 分支中优先于既有 swap/move/reorder parser 执行；当用户说 `先把第三个排到最后，再把当前第二个和当前第四个换一下` 这类明确“先移动到最后、再按当前位置交换”的三序数表达时，会在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前先把第一个序数对应的原队列项移到队尾，再按移动后的当前队列位置交换第二个与最后一个序数，生成完整 `orderedIds`。本地继续复用 `executionStore.reorderQueuedExecutions(orderedIds)` 重排 queued/queued_draft，保留 active/status，并通过 `controlQueuedExecution(syncId, "reorder", { orderedIds })` best-effort 同步后端。Focused UI RED/GREEN 已覆盖旧实现错误 `[1,3,2,4]` 到目标 `[1,3,4,2]`，且验证不调用 LLM、active 不变、queued/queued_draft status 保留。 | 这是“三项局部重排”的第二个受控句式，只覆盖 move-to-last then current-position swap；不是任意多步骤局部重排泛化、多轮指代式重排、拖拽计划板联动、DAG/prepare 重编译联动或 Undo/Replay。真实 `8777` live 联调、完整队列失败/视频/依赖联动、完整历史、Humanizer 和依赖结果合并仍未完成。 |
| Slice 201：自然语言队列 operation plan mini-interpreter 首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlOperationSegments(text)` 与 `parseQueueOperationPlanCommand(text, queue)`，把局部队列重排从单个硬编码句式推进为按 `先/再/然后/接着/随后/then/next` 分段的 operation plan：每段可识别 `交换/互换/对调/换一下/swap` 两序数交换、`移动/移到/排到/放到/调整到/挪到/move` source/target 序数移动、以及移动到 `最后/末尾/last`；命中两个及以上 operation 后，会按当前队列顺序逐步执行，生成完整 `orderedIds`，在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前复用 `executionStore.reorderQueuedExecutions(orderedIds)` 重排 queued/queued_draft，保留 active/status，并通过 `controlQueuedExecution(syncId, "reorder", { orderedIds })` best-effort 同步后端。Focused RED/GREEN 覆盖 `先把第一个和第三个排队任务换一下，再把当前第四个移动到第二个，然后把当前第三个和当前第四个换一下`，旧实现会得到错误顺序或无法正确命中，新实现得到 `[3,4,1,2]`，且不调用 LLM。 | 这是 operation plan mini-interpreter 的首片，已开始替代继续堆硬编码句式；仍不是完整任意自然语言队列编辑器：多轮指代、未显式序数的“它/刚才那个/前两个”、拖拽计划板联动、DAG/prepare 重编译联动、Undo/Replay、真实 `8777` live 联调仍未完成。 |
| Slice 202：自然语言队列前两个/后两个相邻引用最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlAdjacentSwapIndexes(segment, queueLength)`，让 Slice 201 的 `parseQueueOperationPlanCommand()` 在 swap 段中除了显式 `第 N 个` 序数外，还能识别 `前两个/最前两个/前两项/最前两项/firsttwo` 与 `后两个/最后两个/末尾两个/后两项/最后两项/lasttwo` 这种当前相邻队列项引用。Focused RED/GREEN 覆盖 `先把第一个和第三个排队任务换一下，再把前两个换一下`，旧实现只会执行第一段得到 `[3,2,1,4]`，新实现把第二段按当前队首两项再交换，得到 `[2,3,1,4]`，且绕过 LLM、保留 active/status 并同步后端 `action:"reorder"`。 | 这是未显式序数引用的第一片，只覆盖当前队列的前两个/后两个相邻 swap；仍不是完整任意自然语言队列编辑器：`它/刚才那个/这个图生视频任务/标题包含 X 的任务` 等多轮或语义引用、拖拽计划板联动、DAG/prepare 重编译、Undo/Replay、真实 `8777` live 联调仍未完成。 |
| Slice 203：自然语言队列标题关键词引用首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlExecutionReferenceCandidates()`、`queueControlMoveSourceReferenceText()`、`queueControlTitleReferenceIndex()` 与 `parseQueueTitleMoveCommand()`；在 move 分支中优先于两序数 `parseQueueMoveCommand()` 命中“标题关键词 + 目标序数”。Focused RED/GREEN 覆盖 `把海报生成移动到第三个排队任务`：queued 标题为 `故事大纲/海报生成/视频生成` 时，解析器绕过 LLM，唯一命中 `exec-queued-2`，移动到 `targetIndex:2`，保留 active execution 与 queued/queued_draft status，并通过后端 `queue-control` 同步 `action:"move"`。相关 Node/Python 回归已通过。 | 这是标题/line1 唯一关键词匹配的首片；仍不是完整语义引用系统：标题歧义选择、类型/内容引用、多轮“它/刚才那个”、拖拽计划板联动、DAG/prepare 重编译、Undo/Replay、真实 `8777` live 联调仍未完成。 |
| Slice 204：PRD v3.64 真实代码/默会知识复核修复 | 已完成文档切片 | 本轮未改运行时代码、未触碰 `8777`；CodeGraph 默认调用返回 `CodeGraph not initialized for this project`，显式 `projectPath` 调用返回 `database is locked`，且工作区存在 `.codegraph/codegraph.db` 与 `.codegraph/codegraph.db.lock`，因此按 AGENTS 规则降级为 `rg` 与定向读取。已复核 `appAssistantPanel.js` 的 Slice 203 标题关键词 move parser、operation plan mini-interpreter、broad task-control 澄清链路，复核 `assistantExecutionStore.js` 的 queued/queued_draft move/reorder 能力，复核 `assistantExecutionApiClient.js` 与 `canvas_agent_execution_service.py` 的 `move/reorder` 后端同步边界，并把顶部状态、真实代码锚点、Phase 2/3 说明和自检结论更新到 v3.64。 | 这是纯文档复核切片；不新增运行时能力。下一运行时优先补标题引用歧义澄清、类型/内容语义引用、多轮指代、拖拽/可编辑 Plan Board 与同一 operation model 联动，或 Undo/Replay/inverse patch。真实 `8777` live 联调继续由用户手动启动后再做。 |
| Slice 205：自然语言队列标题关键词歧义澄清首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlTitleReferenceMatch()` 与 `queueControlTitleReferenceClarificationReply()`，并让 `parseQueueTitleMoveCommand()` 在标题/line1 候选同分时返回 `action:"clarify"`、`status:"needs_clarification"`、`requestedAction:"move"`、目标 `targetIndex` 和候选列表；`applyNaturalLanguageQueueControl()` 在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前返回本地澄清回复，不修改 active/queued/queued_draft 状态、不调用后端 `queue-control`。`modules/app/appAssistantPanel.p1Ui.test.js` 新增 focused RED/GREEN：`把海报生成移动到第三个排队任务` 同时匹配 `海报生成 A/B` 时，`queueControl.action` 为 `clarify`、回复列出候选、队列顺序不变、LLM 和同步 client 都不调用。相关 JS 回归 `163 pass / 0 fail`，`appAssistantPanel.js` 语法检查通过。 | 这是标题引用歧义的首片，只返回本地文字澄清和候选数据；仍未完成候选按钮/短回答执行、跨会话持久化、类型/内容引用、多轮“它/刚才那个”、拖拽计划板联动、DAG/prepare 重编译、Undo/Replay 和真实 `8777` live 联调。 |
| Slice 206：标题歧义候选短回答/按钮执行最小闭环 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 queue-title 专属 pending clarification 状态、交互卡、短回答解析、候选按钮渲染和完成态回写；`parsePendingQueueTitleClarification()` 支持 `第二个`、`2`、候选标题和候选 id，`applyPendingQueueTitleClarification()` 会完成 `queue_title_clarification` 卡片并把原始 `requestedAction:"move"` 与 `targetIndex` 转回 `applyNaturalLanguageQueueControl()` 的本地 move 链路；执行后保留 active execution 与 queued/queued_draft status，并通过 `controlQueuedExecution(id, "move", { targetIndex })` 做 best-effort 后端同步。新增 RED/GREEN 覆盖短回答与 `.hy-canvas-agent-queue-title-candidate` 按钮两条路径；focused `ambiguous queue title` 为 `86 pass / 0 fail`，相关 JS 回归为 `165 pass / 0 fail`，`appAssistantPanel.js` 语法检查通过。 | 这是标题歧义“选中后执行”的最小闭环；仍不是完整语义引用系统。未完成范围包括类型/内容等非序数引用、多轮 `它/刚才那个` 指代、拖拽/可编辑 Plan Board 联动、DAG/prepare 重编译、Undo/Replay、跨设备/后端消息更新和真实 `8777` live 联调。 |
| Slice 207：自然语言队列生成类型语义引用首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlSemanticReferenceMatch()` 及生成类型 helper，在 title/line1 未唯一命中时读取 queued execution 的 `actionsByStep`，根据 `nodeType/action.type/skillId` 等识别 `image/video/text` 生成类型。`把图片生成那个排队任务移动到最后` 可在本地唯一命中 `ai-image` queued execution 并复用 `move` 链路；如果多个 `ai-image` queued execution 同时命中，则返回 `clarify/needs_clarification`，复用 Slice 206 候选短回答/按钮执行链路。新增 RED/GREEN 覆盖唯一图片生成任务直接移动和两个图片生成任务先澄清再 `第二个` 执行；focused `generation type` 为 `88 pass / 0 fail`，相关 JS 回归为 `167 pass / 0 fail`，`appAssistantPanel.js` 语法检查通过。 | 这是生成类型语义引用首片，只覆盖明确 `图片/图像/image`、`视频/video`、`文本/文字/text` 与 queued `actionsByStep` 中的生成动作类型；仍未完成内容/主题/资产语义引用、多轮 `它/刚才那个` 指代、复杂混合语义重排、Plan Board 拖拽/编辑联动、DAG/prepare 重编译、Undo/Replay 和真实 `8777` live 联调。 |
| Slice 208：自然语言队列 prompt/content 内容语义引用首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlContentReferenceHint()`、`queueControlExecutionContentCandidates()` 与 `queueControlContentReferenceMatch()`，并让 `queueControlSemanticReferenceMatch()` 在没有明确生成类型或生成类型未命中时回退到内容匹配。内容候选只来自 queued execution 的 `actionsByStep` 动作字段：action 本体 `prompt/text/content/description/summary`，`data.prompt/text/content/description/summary`，以及 `payload.prompt/text/content/description`、`params.prompt/text/content/description`；当前代码不读取 `payload.summary` 或 `params.summary`。匹配前会从用户源引用中去掉“这个/那个/排队/任务/生成”等泛词并要求 2 字符以上，避免普通聊天或画布节点表达误触队列控制。`把猫咪海报那个排队任务移动到最后` 可唯一命中包含 `prompt:"猫咪海报，暖色光影"` 的 queued execution 并复用 `move` 链路；多个同内容候选命中时返回 `clarify/needs_clarification`，复用 Slice 206 候选短回答/按钮执行链路。新增 RED/GREEN 覆盖唯一 prompt 内容直接移动和两个 `猫咪海报` prompt 先澄清再 `第二个` 执行；focused `prompt content` 为 `90 pass / 0 fail`，相关 JS 回归为 `169 pass / 0 fail`，`appAssistantPanel.js` 语法检查通过。 | 这是字段级 prompt/content 内容引用首片，不是完整语义检索。它只做规范化子串匹配，且只读取 queued `actionsByStep` 中已经落地的动作内容字段；仍未完成资产级引用、跨轮 `它/刚才那个` 指代、复杂主题相似度检索、复杂混合语义重排、Plan Board 拖拽/编辑联动、DAG/prepare 重编译、Undo/Replay 和真实 `8777` live 联调。 |
| Slice 209：自然语言队列资产字段级语义引用首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlAssetCandidateValues()`、`queueControlExecutionAssetCandidates()` 与 `queueControlAssetReferenceMatch()`，并让 `queueControlSemanticReferenceMatch()` 在无明确生成类型或类型未命中时先尝试资产字段匹配，再回退到 Slice 208 的 prompt/content 匹配。资产候选只来自 queued execution 的 `actionsByStep` 动作字段：`assetId/assetName/assetTitle/assetLabel/assetKey/assetItem*`，以及 `data/payload/params`、嵌套 `asset/assetItem/referenceAsset` 和数组 `assets/assetItems/assetReferences/references/referenceAssets` 中的 `id/name/title/label/asset*` 安全字段；不读取 URL/path/secret。`把新资产4那个排队任务移动到最后` 可唯一命中包含 `assetName:"新资产4"` 的 queued execution 并复用 `move` 链路；多个同资产候选命中时返回 `clarify/needs_clarification`，复用 Slice 206 候选短回答/按钮执行链路。新增 RED/GREEN 覆盖唯一资产字段直接移动和两个 `新资产4` 资产候选先澄清再 `第二个` 执行；focused `asset reference` 为 `92 pass / 0 fail`，`appAssistantPanel.js` 语法检查通过。 | 这是 queued action 字段级资产引用首片，不是完整资产库检索。它只做规范化子串匹配，且只读取 queued `actionsByStep` 中已经落地的资产字段；仍未完成跨轮 `它/刚才那个` 指代、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、复杂混合语义重排、Plan Board 拖拽/编辑联动、DAG/prepare 重编译、Undo/Replay 和真实 `8777` live 联调。 |
| Slice 210：PRD v3.70 真实代码/默会知识复核修复 | 已完成文档切片 | 本轮未改运行时代码、未触碰 `8777`；CodeGraph 显式 `projectPath` 仍返回 `database is locked`，因此按项目规则使用 `rg` 和定向读取核对 `modules/app/appAssistantPanel.js`、`modules/app/appAssistantPanel.p1Ui.test.js` 与本 PRD。已修正 Slice 208 内容候选字段描述，避免把未实现的 `payload.summary/params.summary` 写成已支持；已把 Slice 209 资产字段候选写成真实字段级范围：action/data/payload/params 直接资产字段、嵌套 `asset/assetItem/referenceAsset`、数组 `assets/assetItems/assetReferences/references/referenceAssets` 中的 `id/name/title/label/assetId/assetName/assetTitle`，并继续标注不读取 URL/path/secret。 | 这是纯文档复核切片；不新增运行时能力。仍未完成 Plan Board 可编辑/拖拽/重编译、Timeline Undo/Replay/inverse patch、完整开发者 JSON 面板、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、多轮指代、真实 `8777` live 联调和完整队列失败/视频/依赖联动。 |
| Slice 211：自然语言队列最近引用代词指代首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `hasQueueControlRecentReference()`、`queueControlRecentReferenceRemainder()`、`parseQueueRecentReferenceMoveCommand()` 与 `state.lastQueueControlReference`。当一次明确队列控制成功作用于某个 queued execution 后，面板会记住该 execution id；下一句 `把它移动到第一个排队任务` / `把刚才那个排到最后` 这类纯代词或纯“刚才那个”来源的 move 命令，会在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前直接解析到最近命中的 queued execution，并复用本地 `move` 与后端 `queue-control` best-effort 同步。新增 RED/GREEN 覆盖先用资产字段命中 `新资产4` 并移到最后，再用 `把它移动到第一个排队任务` 将同一 execution 移回首位；focused `recent referenced task pronoun` 为 `93 pass / 0 fail`，`appAssistantPanel.js` 语法检查通过。 | 这是当前内存态最近引用首片，不是完整多轮语义记忆。它不跨会话/跨重启恢复，不解析复杂“它旁边/它后面的那个/刚才那两个”，不处理复杂主题相似度或资产库搜索；Plan Board 拖拽/编辑联动、DAG/prepare 重编译、Undo/Replay、真实 `8777` live 联调仍未完成。 |
| Slice 212：最近队列引用本地会话恢复首片 | 已完成最小闭环 | `modules/assistant/assistantConversationStore.js::appendMessage()` 现在持久化 `kind/queueControl/executionControl`；`modules/app/appAssistantPanel.js::cloneMessage()` 保留 `queueControl/executionControl`，新增 `queueControlReferenceFromMessages(messages)` 并在 `restoreConversation()` 后恢复 `state.lastQueueControlReference`；本地队列控制 assistant 回复写入 conversationStore 时携带 `queueControl`，成功单项控制 metadata 包含 `title`。RED 先验证 restore 后 `canSendMessage("把它移动到第一个排队任务")` 为 false；GREEN focused 测试覆盖同一本地会话恢复后 `它` 继续命中 `exec-queued-asset-4`、绕过 LLM 并同步 `move`；相关回归 `173 pass / 0 fail`。 | 这是同一本地 conversation restore 的最近引用恢复首片，不是跨设备/后端消息同步，也不是任意跨话题长期记忆；复杂“它旁边/它后面的那个/刚才那两个”、复杂主题相似度、资产库搜索、拖拽计划板联动、真实 `8777` live 联调和 Undo/Replay 仍未完成。 |
| Slice 213：最近队列引用相邻项指代首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlRecentNeighborOffset()`，并让 `parseQueueRecentReferenceMoveCommand()` 在纯 recent reference 之前识别“最近引用 + 前/后相邻关系”的 source。`把它前面的那个移动到第一个排队任务` 会找到最近命中 queued execution 的前一个队列项，返回本地 `move`，响应写入 `referenceSource:"recent_queue_neighbor"`，并通过后端 `queue-control` best-effort 同步。新增 RED/GREEN 覆盖先把 `exec-queued-asset-4` 移到最后，再用 `它前面的那个` 命中 `exec-queued-asset-5` 并移到第一位；focused `item before recent reference` 为 `95 pass / 0 fail`。 | 这是最近引用相邻项首片，不是完整复杂多轮指代；仍不支持 `它旁边` 的左右歧义、`刚才那两个`、连续多次相邻跳转、复杂主题相似度、资产库搜索、拖拽计划板联动、真实 `8777` live 联调和 Undo/Replay。 |
| Slice 214：最近队列引用旁边歧义澄清首片 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlRecentAmbiguousNeighborSource()` 与 `queueControlRecentNeighborCandidates()`，并让 `parseQueueRecentReferenceMoveCommand()` 在最近引用任务同时存在前/后相邻项时，对 `把它旁边那个移动到第一个排队任务` 返回本地 `clarify/needs_clarification`。候选按当前队列顺序列出最近引用的前一个和后一个 queued execution；澄清本身不移动队列、不调用后端同步，后续仍复用现有候选短回答/按钮执行链路。新增 RED/GREEN 覆盖最近引用在中间时 `它旁边那个` 返回两个候选；focused `ambiguous neighbor of recent` 为 `96 pass / 0 fail`，相关回归为 `175 pass / 0 fail`。 | 这是左右歧义澄清首片，不是完整复杂多轮指代；仍不支持 `刚才那两个`、连续多次相邻跳转、澄清后复杂链式语义、复杂主题相似度、资产库搜索、拖拽计划板联动、真实 `8777` live 联调和 Undo/Replay。 |
| Slice 215：PRD v3.75 真实代码/默会知识复核修复 | 已完成文档切片 | 本轮未改运行时代码、未触碰 `8777`；CodeGraph 仍为 `database is locked`，因此使用 `rg`/定向读取核验 `appAssistantPanel.js`、`appAssistantPanel.p1Ui.test.js`、`assistantConversationStore.js` 和接力文档。已修复 stale attribution：`它旁边那个` 左右歧义澄清属于 Slice 214，不应只写成 Slice 211/212/213；新增第 2.6 节，把“目标态/真实已完成/仍未完成/接力约束”重新钉住。 | 这是纯 PRD 修复切片；不新增功能、不代表 Plan Board 可编辑、Timeline Undo/Replay、完整历史入口、复杂多轮语义、跨设备 metadata 同步、真实 `8777` live 联调或完整队列失败/视频/依赖联动完成。 |
| Slice 216：最近队列旁边澄清前/后短答执行 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueTitleClarificationRelationAnswer()`；`queueControlRecentNeighborCandidates()` 给旁边澄清候选写入 `relation:"previous"|"next"`，`normalizeQueueTitleClarificationCandidates()` 保留该字段，`parsePendingQueueTitleClarification()` 支持 `前面的/后面的/上一个/下一个/previous/next` 等短答在 relation 唯一时选择候选。新增 RED/GREEN 覆盖 `它旁边那个` 澄清后用户只说 `后面的`，应命中最近引用后方 queued execution 并复用本地 `move` + 后端 `queue-control` 同步；focused `side answer` 为 `97 pass / 0 fail`，相关回归为 `176 pass / 0 fail`。 | 这是旁边歧义澄清后的 relation 短答首片，不是完整复杂链式语义；仍不支持 `刚才那两个`、连续多次相邻跳转、不同会话/跨设备 recent reference、复杂主题相似度、资产库搜索、拖拽计划板联动、真实 `8777` live 联调或 Undo/Replay。 |
| Slice 217：PRD v3.77 真实代码/默会知识一致性修复 | 已完成文档切片 | 本轮未改运行时代码、未触碰 `8777`；CodeGraph 默认调用返回未初始化，显式 `projectPath` 返回 `database is locked`，因此降级使用 `rg`/定向读取。已核对 `appAssistantPanel.js` 的 relation 候选/澄清短答链路、`appAssistantPanel.p1Ui.test.js` 的 `side answer` 测试锚点、PRD 方案 B/9.10/Phase 2/Phase 3/队列状态机/自检结论，修正漏写 Slice 216 的过期表述。 | 这是纯 PRD 修复，不新增运行时能力；下一运行时优先补 `刚才那两个` 多引用、连续相邻指代或进入可编辑 Plan Board/Undo Replay 切片。 |
| Slice 218：最近两个队列引用成组移动 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增最近引用列表与多引用解析：`rememberQueueControlReference()` 维护最近 4 个本地队列控制引用，`parseQueueRecentMultiReferenceMoveCommand()` 识别 `刚才那两个/这两个/both/those two`，取最近两个不同 queued execution，按当前队列顺序生成完整 `orderedIds`，并返回 `referenceSource:"recent_queue_multi"`。`parseNaturalLanguageQueueControl()` 在 move/reorder/top 分支优先处理该多引用，避免旧 operation plan parser 误吃；修复 `targetIndexOverride=null` 被 `Number(null)` 当成 0 的问题。Focused RED/GREEN 覆盖 `把刚才那两个移动到最后`，focused 为 `98 pass / 0 fail`，相关回归为 `177 pass / 0 fail`。 | 这是同一本地会话的最近两个明确队列控制对象首片；不支持跨会话/跨设备恢复，不支持任意“刚才那几个/那一组”，不做主题相似度，不访问资产库，不代表完整自然语言语义调度器、真实 `8777` live 联调或 Undo/Replay 完成。 |
| Slice 219：同一本地会话恢复最近两个队列引用 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlReferencesFromMessages()`，按历史 assistant message 的 `queueControl.executionId/executionIds` 顺序重建最近 4 个本地队列控制引用；`queueControlReferenceFromMessages()` 返回 `recentExecutionIds`；`restoreConversation()` 直接恢复 `state.recentQueueControlReferences`。新增 focused RED/GREEN 覆盖同一本地 conversation 保存后新建 state 并 restore，再说 `把刚才那两个移动到最后`，应绕过 LLM、保留 active/status、按当前队列顺序生成 `referenceSource:"recent_queue_multi"` 与完整 `orderedIds`；focused 为 `99 pass / 0 fail`。 | 这是同一本地 conversation restore 后的最近两个引用重建首片；不支持不同 conversation、跨设备或后端消息同步 recent reference，不支持任意“刚才那几个/那一组”，不做主题相似度，不访问资产库，不代表完整自然语言语义调度器、真实 `8777` live 联调或 Undo/Replay 完成。 |
| Slice 220：PRD v3.80 真实代码/默会知识一致性修复 | 已完成文档切片 | 本轮未改运行时代码、未触碰 `8777`；CodeGraph 显式 `projectPath` 仍返回 `database is locked`，因此降级用 `rg`/定向读取核验 `queueControlReferencesFromMessages()`、`restoreConversation()`、`appAssistantPanel.p1Ui.test.js` 的 Slice 219 focused test 与 `assistantConversationStore.appendMessage()` metadata 保存。已把“最近一次引用”更新为“最近 4 个引用/最近两个引用 restore”，并补齐 Phase 2/3、9.10、方案 B 差异、自检结论中漏列的 Slice 219。 | 这是纯 PRD 修复；不新增运行时能力，不代表跨设备/后端消息同步 recent reference、不同 conversation、完整自然语言语义调度器、Plan Board 编辑、Undo/Replay 或真实 `8777` live 联调完成。 |
| Slice 221：最近三个队列引用成组移动 | 已完成最小闭环 | `modules/app/appAssistantPanel.js` 新增 `queueControlRecentMultiReferenceCount()`，让 `parseQueueRecentMultiReferenceMoveCommand()` 从固定最近两个扩展为按数量词读取最近 2/3/4 个引用；本轮用 TDD 验收“刚才那三个”首片：最近三次明确队列控制分别命中资产、相邻项和 prompt 内容后，`把刚才那三个移动到第一个排队任务` 会绕过 LLM、保留 active/status、按当前队列顺序生成完整 `orderedIds` 并同步后端 `action:"reorder"`。Focused `recent three queue references` 为 `100 pass / 0 fail`，相关回归为 `179 pass / 0 fail`。 | 这是同一本地会话最近三个明确队列控制对象的成组移动首片；不支持不同 conversation、跨设备或后端消息同步 recent reference，不支持无明确数量的“刚才那几个/那一组”，不做复杂主题相似度或资产库搜索，不代表完整自然语言语义调度器、真实 `8777` live 联调或 Undo/Replay 完成。 |
| Slice 222：Orchestrator inverse patch 捕获 | 已完成最小闭环 | `assistantExecutionOrchestrator.js` 新增 `inverseForActionResult()` 与 `nodeSignatureProvider` 注入；`create_node`/`connect_nodes` 成功执行后按 `createdNodeIds/createdEdgeIds` 生成 `inverse.ops`，completed 事件 `canUndo=Boolean(inverse)`；生成类动作仍 `canUndo:false` 且无 inverse。 | 仅删除型 inverse；`update_node`/`layout_nodes` 属性级 inverse、生成动作 undo 仍未做。 |
| Slice 223：Orchestrator undo 最小闭环 | 已完成最小闭环 | `undo(executionId,{eventId})` 依赖注入 `applyInverseOps`；按 eventId 定位含 inverse 的事件，成功写 `undone`（developer.undoneFromEventId/removedNodeIds/removedEdgeIds/conflicts），全部冲突写 `undo_conflict`，hook 抛错写 `undo_failed`，重复撤销返回 `already_undone`，运行中/缺 inverse/缺 hook 返回 `undo_unavailable`。 | 单事件撤销；没有“撤销到这里”的多步回滚和 Replay。 |
| Slice 224：inverse 前后端持久化 | 已完成最小闭环 | 前端 `sanitizeTimelineEvent()` 新增 `sanitizeInverse()`（只保留 remove_node/remove_edge、清洗 signature、无效 op 丢弃、无 inverse 不写 key）；后端 `CanvasAgentExecutionService._sanitize_inverse()` 同等规则并继续脱敏 secret；落盘重载后 inverse 保留。 | 不改变 route 合同；后端没有 undo 执行 API（undo 是前端 Orchestrator 行为）。 |
| Slice 225：抽屉“撤销此步”UI + 冲突保留 | 已完成最小闭环 | `appAssistantPanel.js` 详情区对 `canUndo=true` 且有 `inverse.ops` 且未被撤销的 selected event 渲染 `.hy-canvas-agent-execution-detail-undo`；默认 orchestrator wiring 注入 `applyInverseOps`/`nodeSignatureProvider`，用 `graphStore.removeNode/removeEdge` 删除 AI 创建对象；节点缺失或签名不一致（用户修改过）写 conflict 并保留画布；`appAssistantPanel.autoload.js` 适配器新增 `removeNode`（runtime `deleteNodes`）与 `removeEdge`。 | 撤销后画布刷新依赖 graphStore 自身渲染；签名只覆盖 name/data 浅层；视频/生成资产不在 undo 范围。 |
| Slice 226：Plan Board 步骤启停首片 | 已完成最小闭环 | `assistantExecutionStore.setPlanStepEnabled()`：executing 拒绝、已执行步骤拒绝、有进度后重新启用拒绝、缺步骤拒绝；展开态计划区对 draft/waiting_confirmation/queued/queued_draft/paused/failed 渲染“停用/启用”toggle，停用步骤显示“（已停用）”，切换后 best-effort PATCH 后端 `plan`；`compilePlanActions()` 跳过 `enabled===false` 步骤。 | 没有拖拽排序、单步执行、DAG 预览、编辑后 recompile；启停粒度是步骤级不是 action 级。 |
| Slice 227：完成总结关闭 + 执行历史入口 | 已完成最小闭环 | completed 执行抽屉条件按钮为“关闭”，点击置 `drawerState.visible=false` 并 best-effort 同步后端；无可见执行但项目有 execution 时抽屉渲染 `.hy-canvas-agent-execution-history-toggle`“执行历史（N）”，展开 `.hy-canvas-agent-execution-history-list` 按 updatedAt 倒序最多 10 条，点击 `.hy-canvas-agent-execution-history-item` 恢复 `visible=true` 找回任务。 | 没有搜索、筛选、分页和跨项目历史；超过 10 条只能找回最近 10 条。 |
| Slice 228：点击聊天区收起展开抽屉 | 已完成最小闭环 | `messagesEl` click 监听在 `executionDrawerExpanded` 时收起为状态条；抽屉保持可见，失败/待授权状态条仍显示。 | 仅覆盖聊天区点击；没有真实 overlay/backdrop、blur 视觉和画布区域点击处理。 |
| Slice 229：属性级 inverse（restore_node） | 已完成最小闭环 | Orchestrator 注入 `nodeSnapshotProvider`，update 类 action 执行前捕获 `{name,data}` 快照，完成事件 inverse 含 `restore_node`（prior name/data + 执行后 signature）；undo 恢复属性返回 `restoredNodeIds`；前后端 sanitizer 支持 `restore_node` 并脱敏 data；UI“撤销此步”同路径生效。 | 恢复是 data patch 语义：AI 新增而此前不存在的 key 不会被删除；`layout_nodes/move_nodes` 位置级 inverse 未做。 |
| Slice 230：多步“撤销到这里” | 已完成最小闭环 | `orchestrator.undoTo()` 反向撤销选中事件及之后全部可撤销事件（含语义为“回滚到该步之前”），跳过已撤销项，`undo_failed` 中断，聚合计数；详情区 `.hy-canvas-agent-execution-detail-undo-to` 仅在选中事件之后还有可撤销事件时显示。 | 不是事务：中途冲突不回滚已撤销项，冲突项保留画布并记录 `undo_conflict`；无 Replay。 |
| Slice 231：真实 8777/8779 live 联调首轮 | 已完成首轮 | 经用户授权完成：8779 当前代码实例 10 项 executions API live 验证全过；跨重启 executing→paused live 验证过；`restore_node` live 持久化过；确认用户 `8777` 长驻实例为 2026-06-09 旧代码、缺 executions 路由，需人工重启。 | 浏览器级 UI live 验收未完成（无头 preview 无法启动重画布应用、无已连接 Chrome）；聊天/LLM 链路 live 联调未做。 |
| Slice 232：位置级 inverse（restore_node_position） | 已完成最小闭环 | Orchestrator 注入 `nodePositionProvider`，layout/move 执行前捕获 nodeIds 位置，inverse 含 `{nodeId,x,y,signature}`；undo 直改 `node.x/y` 还原；用户移动后签名不一致写 `node_moved` 冲突；前后端 sanitizer 支持。 | `layout_nodes` 写入的 `data.layoutStrategy` 不回滚；组内嵌套/group 位置联动未覆盖。 |
| Slice 233：Plan Board 拖拽排序 + recompile 首片 | 已完成最小闭环 | `reorderPlanSteps()` 全量置换校验+已执行步骤位置锁定+`plan_edited` 事件；UI 未执行步骤 draggable + 上移/下移按钮；重排 best-effort 同步后端 plan；run()/resume() 每次从最新 plan 重新编译。 | 不是跨步骤 action 级重排；无可视拖拽指示器动画；recompile 不重新调用 LLM 重新生成 actions。 |
| Slice 234：执行历史搜索/筛选 | 已完成最小闭环 | 历史列表上方搜索框按标题/状态/抽屉文案过滤，匹配后仍按 updatedAt 倒序取前 10。 | 无分页、无独立状态筛选 chips、无跨项目搜索。 |
| Slice 235：展开态 overlay/blur | 已完成最小闭环 | 聊天区 `.hy-canvas-agent-execution-backdrop`（blur 遮罩，点击收起），展开态抽屉 blur/阴影；真实 Chromium 验收通过。 | 遮罩只覆盖面板聊天区，不覆盖画布；无过渡动画。 |
| Slice 236：piSdkAdapter /openai 网关 URL 修复 | 已完成最小闭环 | `resolveOpenAIChatCompletionsUrl()` 对 `/openai` 结尾 base 拼 `/v1/chat/completions`（与 `claw_provider_proxy_service._endpoint()` 同规则）；TS/JS 双改；focused 测试通过；live 请求已到达真实网关。 | 完整 LLM completion 验收止步于用户 key 配额封顶，需续费后复跑。 |
| Slice 237：真实 Chromium UI live 验收 | 已完成首轮 17/17 | Playwright 驱动真实 Chromium 加载 `8778` 当前代码实例，全链路验收抽屉/计划编辑/撤销/历史/遮罩并清理种子数据；发现并按真实交互修正“无消息时聊天区点击”应由 backdrop 承担。 | 字面 `8777` 端口被用户桌面打包应用占用，策略禁止自动终止；切换需人工关闭该应用。 |
| Slice 238：piClient fenced-JSON 解析修复 | 已完成最小闭环 | Gemini 等模型把 action JSON 包在代码栅栏中导致 `parseJsonObject()` 回退正则（锚定行尾大括号）失败；新增 `stripMarkdownCodeFence()` 预剥栅栏，TS/JS 双改，focused 测试覆盖 fenced 输入产出完整 v2 plan/actionsByStep。 | 只处理整体包裹的单个栅栏；多段混排文本+多个 JSON 块不在最小闭环内。 |
| Slice 239：真实 8777 全量 live 验收 | 已完成 | 字面 `8777`（用户重启为本仓当前代码）上：17/17 真实 Chromium UI 验收（脚本归档 `tools/run_canvas_agent_ui_acceptance.mjs`）；gemini-3.1-pro 完整 v2 contract LLM 应答（9.1s、零 warnings、create_node+focus_nodes）。 | gpt-5.5 通道仍配额封顶；Replay、历史分页、layoutStrategy 回滚仍在路线图。 |
| Slice 240：面板模型选择对齐文本节点 | 已完成最小闭环 | 面板模型清单与文本生成节点同规则（selectable：排除 deleted/disabled，保留 failed/未测试与缺配置项）；failed 模型可选可发送；缺 key 项以禁用态显示原因并阻断发送；默认模型仍优先非 failed；真实 8777 live 验证 failed 状态 gemini-3.1 可见可选。 | 面板与文本节点仍是两套实现（assistantModelRegistry vs modelRegistryFilters）按同规则镜像，未抽取共享模块；菜单未展示文本节点的厂商内置模型清单（仅 modelRegistry 用户配置模型）。 |
| Slice 241：技能运行时强校验 | 已完成最小闭环 | 后端 schema 按 skill.json allowed/forbidden 拦截并返回 blockedBySkill；matchedSkills 前后端持久化；Orchestrator 写 blocked_by_skill 事件 fail-closed；离线 runner 深度断言（约束一致性 + qualityRules 非空）。 | 真实 LLM 响应 matchedSkills 为空（模型不回填）→ 真实链路拿不到命中清单；需在 PI/Claw 包装层回填；qualityRules 仍只断言存在性，无语义校验。 |
| Slice 242：成功指标本地埋点 | 已完成最小闭环 | computeExecutionMetrics() 派生第 20 章可计算指标并入 debugSnapshot。 | 本地快照级，无后端聚合、无历史趋势、无 UI 仪表盘；部分指标（命中准确率分母、满意度）不可本地计算。 |
| Slice 243：真实耗时 + 结构化 target | 已完成最小闭环 | completed/failed 事件写真实 durationMs 与 target；前后端 sanitize 往返保留；live E2E 证实平均耗时非零。 | running/状态类事件不带 duration；target.nodeType 对非生成动作为空。 |
| Slice 244：Replay/单步重生成 | 已完成最小闭环 | replay() 结构动作重放 + 生成跳过 + replayed/replay_skipped_generation 事件；regenerateStep() 不动 cursor、视频需重新授权；UI 双按钮。 | 重放不重建生成结果（按 4.2 设计）；重放后的别名引用依赖同批新建（跨原执行的旧节点引用不可恢复）；无回放进度条。 |
| Slice 245：开发者 JSON 面板 | 已完成最小闭环 | 详情区开发者开关 + 选中事件 JSON（含 target/inverse/developer）。 | 全局开关而非用户级配置；不含请求级 prompt/上下文（属脱敏范围）。 |
| Slice 246：只读 DAG + 历史分页 | 已完成最小闭环 | 计划区依赖边列表；执行历史 10 条分页“加载更多”。 | DAG 是文本边列表非图形化；历史无状态筛选 chips。 |
| Slice 247：共享模型规则 + 群组引用 | 已完成最小闭环 | registry raw 层复用 isSelectableApiModel 单一规则源；“刚才那几个/那一组”按全部最近引用成组移动（单引用时回退）。 | 面板/文本节点仍是两个 option 层包装；群组引用上限仍是最近 4 个。 |
| Slice 248：跨 action 别名解析修复 + 真实 LLM E2E | 已完成 | live E2E 发现的真实 bug：逐步执行丢失批内别名映射；Orchestrator 现维护跨 action 别名表（run/replay）；`tools/run_canvas_agent_llm_e2e.mjs` 真实 UI 驱动 6/6（gemini-3.1-pro，7 action 真实执行、真实节点落画布、自清理）。 | regenerateStep 不做跨原执行的别名恢复；E2E 单场景（文本分镜），图片/视频真实生成场景未跑。 |
| Slice 249：matchedSkills 真实链路回填 | 已完成 | 技能定义保留 triggers；piClient 双分支按消息本地命中回填 intent.matchedSkills（与模型回传去重合并）；live E2E 证实真实 gemini 响应回填 storyboard_workflow、skillHitRate=1。 | 触发词为子串匹配，无语义相似度；模型回传的未知 skill id 由后端 loader 静默跳过。 |
| Slice 250：8777 重启 + 强校验 live 闭环 | 已完成 | 用户指示下重启 8777 加载后端强校验；live 双向验证（拦截越界 PASS / 放行合法 PASS）；storyboard_workflow 补通用触发词“分镜”；E2E 升级为 8 项断言。 | 强校验只覆盖 allowed/forbidden 动作类型；qualityRules 语义校验仍未做。 |
| Slice 251：指标后端聚合 + 仪表 | 已完成最小闭环 | compute_metrics() + /metrics 路由 + fetchMetrics() + 开发者模式指标块。 | 无历史趋势图与独立仪表页；快照级聚合。 |
| Slice 252：图形化 DAG + 历史 chips | 已完成最小闭环 | 分层 ASCII 图 + 状态 chips 过滤（与搜索/分页叠加）。 | ASCII 非交互图形；菱形汇聚结构按首达层渲染。 |
| Slice 253：qualityChecks 机器断言 | 已完成最小闭环 | requiresActionType/forbidsActionType/maxActions 三类检查强制于 examples；内置 4 skill 已配置。 | 检查作用于 examples 静态数据，不在运行时执行链上强制。 |
| Slice 254：语义化触发词 | 已完成最小闭环 | 子串/多词（停用词过滤）/CJK 双半段三规则，PI 与 Claw 同构镜像。 | 非向量语义；同义词表未建。 |
| Slice 255：真实图片生成 E2E | 已完成 | 5/5：真实排队+启动 ai-image 生成、matchedSkills 在场、自清理。 | 不等待图片最终渲染完成；Orchestrator 路径不回写 state.generationTasks（已知缺口，下一优先级）。 |
| Slice 256：共享净化模块 | 已完成 | sensitiveDataRules.js 单一规则源（键模式并集+字符串清洗并集+策略键例外表），合同与导演双净化器同源。 | 执行 store 的 python 端净化仍是独立实现（规则等价但未同源）。 |
| Slice 257：director 技能 | 已完成 | 第 5 个内置技能：生成类动作全禁、qualityChecks、离线 15 cases 过、服务端拦截 live PASS。 | 49 个影视 skills 留在 QMAI 侧（创作配方库≠执行治理表，按评审保持两个注册表）。 |
| Slice 258：第一刀接线 | 已完成 | runner(L3)+bridge+route+面板「导演：」命令；删除中间 PI；v2 合同复用全部工作台；dependsOn 进 plan；live DIRECTOR E2E 7/7。 | 工件（storyboard/action-package）依赖 QMAI 导出文件就位；QMAI Phase 3 真接入仍未开始。 |
| Slice 259：prepare 分流 | 已完成 | 一条 prepare 通道两种策略：director 任务按最新 QMAI 记忆重编排，普通任务 fresh-context；fail-closed 不变。 | 重编排不保留用户对旧计划的手工步骤启停。 |
| Slice 260：回执导出投影 | 已完成 | huanying-execution-receipts/v1（路由+文件桥工具），含指标与撤销计数，对称单向只读。 | QMAI 侧消费端待其会话实现；无自动定时导出。 |
| Slice 261：golden fixture | 已完成 | qmai-live-sample 入库 + loader 契约回归测试。 | 跨仓 CI（QMAI 真实导出做输入）待 QMAI 仓库收尾后补。 |
| Slice 262：live 验收 | 已完成 | 技能拦截/director plan/receipts/E2E 7/7 全过；8777 已带 fixture env 重启。 | E2E 用 fixture 项目；真实 QMAI 项目目录验收待用户指定路径。 |
| Slice 263：生成确认计数/判定/文案 helper | 已完成 | countGenerationActions 只算真实生成派发（nodeType 归类+graphStore 回查）；plan=图/视频确认、act=仅视频；零项省略文案。 | 口径变更同步到所有调用方；nodeType 缺失且画布查不到时归入文本计数。 |
| Slice 264：v2 抽屉链路重构 | 已完成 | 零确认计划自动 orchestrator.run（含 Plan 模式）；确认卡新文案；「授权视频」并入「确认」单门（run 传 videoAuthorized:true）；executor 包装层尊重 payload.videoAuthorized；line1==line2 去重。 | waiting_video_authorization 重试停点沿用同一「确认」按钮恢复。 |
| Slice 265：旧卡片流同规则 + APPLY 退役 | 已完成 | state 层 canAutoApply 改新规则驱动（取代 act+低风险旧策略）；卡片 requiresConfirmation/confirmationMessage 按计数设置；卡片确认一步授权视频；strongConfirm 按钮常隐。 | 旧的「plan 创建视频节点也确认」语义按规格废除（空节点不拦）。 |
| Slice 266：确认态视觉重设计 | 已完成 | data-confirm 绿框态、类型数量徽章（文本/图片/视频 ×N）、高亮确认钮、渲染层实时确认文案；live 截图成型。 | 仅确认态重做；其余抽屉状态视觉未动（按用户选择）。 |
| Slice 267：E2E 与 live 验收更新 | 已完成 | director E2E 改「结构免确认自动执行」断言 7/7；LLM 8/8、IMAGE 5/5 容错通过；确认卡 live 视觉 3/3+截图。 | 视频真实生成的 live E2E 仍未做（成本/时长原因，确认门行为已由单测+视频通道复用覆盖）。 |
| Slice 268：技术警告过滤 + 旧数据渲染去重 | 已完成 | 用户警告条过滤后端 schema 的 repaired 技术修复提示（信息保留在 lastWarnings 供开发者模式）；抽屉渲染层对 line1==line2 的旧持久化执行兜底显示状态文案——record 层去重只救新数据，渲染层兜底救存量数据。live 2/2 验证。 | repaired 过滤是展示层规则（正则 repaired），后端 warning 文案变化需同步。 |
| Execution Drawer / Backend / Orchestrator | 部分完成 | 现有 UI 已在 preview card + apply button 兼容流之外新增输入框上方 `.hy-canvas-agent-execution-drawer`，可展示收起态、只读计划/时间线、展开态任务队列横条、队列卡片切换查看、时间线详情文本、时间线滚动策略、前端本地含节点 id 的时间线事件聚焦、非视频“确认”和视频“授权视频”按钮；后端 `/api/v2/canvas-agent/executions/*` route/service 已可用，已持久化 execution `orchestratorState`、timeline `nodeIds/error/canRetry/canUndo/durationMs` 和 queued `drawerState.queuePaused`，并支持 `/queue-control` 队列控制；前端已能尽力同步新 execution、初始 timeline event、状态 PATCH 和 queued 控制；`assistantExecutionOrchestrator.js` 已有核心首片、pause/resume/cancel cursor、retry 首片、skip 首片、视频 retry 授权安全门、最小 timeline 人话化、selected-event retry/skip、dependency_blocked 最小依赖恢复、源事件依赖详情 UX、跳过暂停排队任务的最小队列调度，以及 `queued_draft` 强制 prepare/fresh actions 才执行的最小状态机；`appAssistantPanel.js` 已让抽屉“暂停/继续”、当前任务本地“取消”、非视频 v2 “确认”、v2 “授权视频”、抽屉级“重试”、selected-event“重试此步”、selected-event“跳过此步”、selected video event“授权视频”、展开态排队任务“置顶/暂停/继续/取消”调用真实 store/Orchestrator/queue-control 能力，且源事件详情可显示“后续 N 步依赖这一步”；`assistantAgentOrchestrator.js` 只是多 Agent 角色/权限计划器。 | 继续补完整历史浏览入口、完整 Timeline Humanizer 词库/错误中文化、完整队列状态机（失败联动、自然语言控制完整语义版、跨重启冲突处理）、完整依赖重编译/结果合并和 Undo/Replay。 |

### 2.3 真实代码核验锚点

接力开发必须优先以这些文件为准，不要只按旧方案文字猜：

| 文件 | 已核验事实 | 对 PRD 的影响 |
|---|---|---|
| `services/claw_skill_registry_service.py` | v2 loader 已存在，默认读 `config/assistant-skills-v2`，显式 `skill_dir` 不自动读默认 v2。 | Phase 1 不再从 loader 重新开始；后续改动要保护测试隔离行为。 |
| `services/claw_bridge_service.py` | prompt payload 有 `assistantSkills`；输出 parser 已保留并清洗 v2 contract 字段。 | 后续重点是让 UI/Orchestrator 消费这些字段，不是重新做 skill 注入。 |
| `integrations/pi_canvas_agent/src/huanyingTools.ts` / `.js` | v2 skills 可加载并注入 system prompt；TS 和 JS runtime mirror 都被维护。 | PI 后续必须同时改 TS 和 JS，当前环境不能只改 TS 等 build。 |
| `integrations/pi_canvas_agent/src/piClient.ts` / `.js` | 真实请求已默认加载 `config/assistant-skills-v2` 并传 `skills` 给 `buildCanvasAgentSystemPrompt(mode, { skills })`；旧 actions 会包成最小 v2 plan。 | 后续重点是前端执行抽屉、Project Execution Store 和 Orchestrator 消费这些字段。 |
| `integrations/pi_canvas_agent/src/protocol.ts` / `.js` | `safeResponse()` 和 `safeStreamFrame()` 已保留并清洗 v2 contract 字段。 | 后续重点是前端执行抽屉和 store 消费这些字段。 |
| `modules/assistant/canvasSkills/manifest.js` | Canvas Skills stable id 已有文本、图片、视频、资产、workflow、bindReferences。 | Unified registry 只做 adapter，不替换 Canvas Skills manifest/runtime。 |
| `modules/assistant/canvasSkills/registry.js` | 旧 action -> skill id 映射已存在；v2 skill -> Canvas skill id adapter 最小闭环已存在；Act 模式下真实视频生成仍需确认的前端/preview/Canvas Skill policy 最小闭环已完成。 | 后续重点是 timeline/trace 与 Orchestrator 重复执行视频授权安全门；不要再把 PI 默认加载或 v2 contract 当成未完成项。 |
| `modules/app/appAssistantPanel.js` | 右侧面板、输入框、preview card、apply flow 已存在；抽屉 UI 已消费 execution store；`parseNaturalLanguageQueueControl()` / `applyNaturalLanguageQueueControl()` 已在 `sendMessage()` 的模型配置 guard、`api.chat/chatStream` 和 LLM 调用前拦截受控队列命令，覆盖单项取消/置顶/暂停/继续、`cancel_all`、source/target 序数移动、完整序数列表全量重排、两个明确序数交换、Slice 199/200 的两类受控三项局部重排、Slice 201 的 `queueControlOperationSegments()` + `parseQueueOperationPlanCommand()` 多步骤 operation plan 首片、Slice 202 的 `queueControlAdjacentSwapIndexes()` 当前前两个/后两个相邻 swap 引用、Slice 203 的标题关键词唯一命中移动、Slice 205 的 `queueControlTitleReferenceMatch()` + `queueControlTitleReferenceClarificationReply()` 标题关键词歧义本地澄清、Slice 206 的 `queue_title_clarification` 卡片/短回答/候选按钮执行、Slice 207 的 `queueControlSemanticReferenceMatch()` 生成类型语义引用首片、Slice 208 的 `queueControlContentReferenceHint()` / `queueControlExecutionContentCandidates()` / `queueControlContentReferenceMatch()` prompt/content 内容引用首片、Slice 209 的 `queueControlAssetCandidateValues()` / `queueControlExecutionAssetCandidates()` / `queueControlAssetReferenceMatch()` 资产字段级引用首片、Slice 211 的 `hasQueueControlRecentReference()` / `queueControlRecentReferenceRemainder()` / `parseQueueRecentReferenceMoveCommand()` 最近一次命中任务代词引用首片，以及 Slice 212 的 `queueControlReferenceFromMessages()` + `restoreConversation()` 最近引用本地会话恢复首片，以及 Slice 213 的 `queueControlRecentNeighborOffset()` 最近引用相邻项指代首片、Slice 214 的 `queueControlRecentAmbiguousNeighborSource()` / `queueControlRecentNeighborCandidates()` 最近引用旁边歧义澄清首片，以及 Slice 216 的 `queueTitleClarificationRelationAnswer()` + relation 候选短答执行首片、Slice 218 的 `parseQueueRecentMultiReferenceMoveCommand()` 最近双引用成组移动首片、Slice 219 的 `queueControlReferencesFromMessages()` 同一本地 conversation restore 后最近双引用重建首片；`parseQueueOperationPlanCommand()` 会优先于旧的单句式 parser，按多个句段依次执行 swap/move 并生成完整 `orderedIds`。 | 已从“继续堆单个受控句式”推进到 mini-interpreter + 相邻引用 + 标题关键词唯一命中 + 标题歧义文字澄清 + 候选短回答/按钮执行 + 生成类型语义引用 + prompt/content 内容引用 + 资产字段级引用 + 当前内存态最近引用代词首片 + 同一本地会话 restore 后最近引用恢复 + 最近引用前/后相邻项首片 + `它旁边` 左右歧义澄清首片 + 澄清后 `前面的/后面的` 短答执行首片 + 同一本地 conversation restore 后最近双引用重建首片；后续要继续补复杂多轮指代、不同会话/跨设备/后端消息同步 recent reference、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、Plan Board 拖拽/编辑与同一 operation model 联动、DAG/prepare 重编译联动、跨设备消息更新和 Undo/Replay。 |
| `modules/assistant/assistantExecutionStore.js` | Phase 2 前端项目级 store 最小切片已存在；离线 localStorage 可保存 `executions/queue/timeline/drawerState/orchestratorState`，并清洗 API key、本地绝对路径、headers/cookie 等敏感字段；`importExecutions()` 已支持导入后端 execution 历史；前端本地 timeline event 已保留去重后的 `nodeIds` 供 UI 聚焦；`moveQueuedExecutionToTop()` / `moveQueuedExecutionToIndex()` / `reorderQueuedExecutions()` 都使用 queued/queued_draft 统一队列定义，重排时不影响 active execution，并保留队列项状态。 | 已由 `appAssistantPanel.js` 写入 v2 response，输入框上方执行抽屉也已消费 `snapshot()`；前端 API 尽力同步、面板 init 历史加载、队列卡片查看切换、时间线滚动策略、本地时间线详情聚焦、selected-event retry/skip/video authorization、单项移动和完整序数列表重排已落地；后端导入历史保留 `nodeIds/orchestratorState` 等拓展字段已由 Slice 149 补上。下一步补完整历史入口、完整依赖重编译/结果合并和 Undo/Replay。 |
| `modules/assistant/assistantExecutionApiClient.js` | 前端 execution API client 已存在，使用 `/api/v2/canvas-agent/executions` upsert execution，使用 `/api/v2/canvas-agent/executions/{id}/timeline` 追加 timeline event，使用 `/api/v2/canvas-agent/executions/{id}/status` PATCH 状态，使用 `/api/v2/canvas-agent/executions/{id}/queue-control` 同步 queued 任务 `top/pause/resume/cancel/move/reorder`，其中第三个 `payload` 参数可携带 `targetIndex` 或 `orderedIds`；使用 `listExecutions(filters)` 从 `/api/v2/canvas-agent/executions?projectId=...` 读取历史；Slice 172 后新增 `prepareQueuedExecution(executionId,payload)`，POST `/api/v2/canvas-agent/executions/{id}/prepare`。 | 目前覆盖初始同步、启动时历史加载、Orchestrator 核心状态 PATCH、queued 控制 best-effort 同步、后端扩展字段持久化后的历史导入、move/reorder 队列同步，以及 queued prepare thin boundary 的独立 client；Slice 173 已让主浏览器 API `api/canvasAgentApi.js` 暴露同名方法。完整历史浏览、后端执行链路授权语义和 Undo/Replay 仍待补。 |
| `api/canvasAgentApi.js` | 主浏览器 Canvas Agent API client 已封装 chat/chatStream/validate/conversations/generation/sync 等路径；`modules/app/appAssistantPanel.autoload.js` 默认使用 `createCanvasAgentApi()`；Slice 173 后已实现 `prepareQueuedExecution(first, second)`，POST `/api/v2/canvas-agent/executions/{id}/prepare`，支持 app payload 和 `(executionId,payload)` 两种调用形态。 | 这让 Slice 171 的 app prepare hook 在默认 autoload/browser API 对象上具备可调用方法；但它只是薄客户端，默认 server 已注入 prepare runner；若 PI/LLM runtime 或 provider 配置失败，Orchestrator 仍应 fail-closed。真实 8777 live 联调仍未完成。 |
| `modules/assistant/assistantExecutionOrchestrator.js` | 真实执行时间线 Orchestrator 已存在：`compilePlanActions()` 从 `plan.steps` + `actionsByStep` 编译序列；`run()` 逐 action validate/execute 并写 timeline；`pause()/resume()/cancel()/retry()/skip()` 已有最小闭环；`cancel()` 对正在运行的 active execution 采用 request 语义，在当前 action 完成后写 `cancelled` timeline/status、清空 running，并保留 queued/queued_draft 不自动拉起；非运行但可取消的 draft/paused/failed/waiting 状态可直接标记 cancelled；`runNextQueuedExecution()` 从 `snapshot().queue` 选择首个 `drawerState.queuePaused !== true` 的 queued/queued_draft execution，并在自动 `run(nextId, { startActionIndex:0 })` 前，如果构造时注入了 `prepareQueuedExecution`，会读取最新 execution、把 `execution/executionId/context/agentMode/videoAuthorized` 交给 hook，持久化 hook 返回的 `plan/actionsByStep/drawerState`，再追加 `prepared` timeline event；Slice 170 后 prepare 失败会 fail-closed；Slice 175 后 queued_draft 无 prepare 或无 fresh actions 会 fail-closed，不执行旧 actions。 | 后续不要再从零写 Orchestrator；应在现有 `prepareQueuedExecution` hook 和 `cancel/pause/resume/retry/skip` 控制面上补队列恢复策略、依赖重编译/结果合并、Undo/Replay 和 live 联调问题。默认 `appAssistantPanel.js` 已在 `api.prepareQueuedExecution` 存在时传入 latest `buildContext({ graphStore })`，且主 `createCanvasAgentApi()` 已暴露该方法；真实 8777 live 联调仍未完成。 |
| `modules/app/appAssistantPanel.test.js` | 已覆盖 v2 response 写入 execution store、后端初始同步、同步失败 fallback，以及 Slice 139 的面板 init 历史加载和加载失败 fallback。 | 后续补完整历史入口、状态 PATCH、Orchestrator 行为时继续在这里加 RED 测试。 |
| `modules/app/appAssistantPanel.p1Ui.test.js` | Phase 2/3 UI 测试已覆盖收起态抽屉、展开态计划/时间线、视频授权按钮、普通确认、视频待确认文案安全、队列横条、timeline event 详情、队列卡片切换查看、时间线滚动策略、聚焦对象、抽屉暂停/继续、v2 确认/授权视频、失败重试、selected-event 重试/跳过/视频授权、queued 卡 `top/pause/resume/cancel` 后端同步、默认 Orchestrator latest context + explicit prepare API boundary。Slice 182/183/185/186 后还覆盖自然语言队列命令和当前任务暂停/继续/取消在缺模型配置时绕过 LLM、单项取消/置顶/暂停/继续、`取消全部排队任务`、当前 active cancel 不误伤 queued、以及“取消第一个节点”不误判；Slice 188-195 覆盖 broad 命令澄清、短回答/按钮执行、完成/禁用态、history 恢复、completed card 本地持久回写和旧澄清自动归档；Slice 196-209 覆盖指定位置移动、完整序数列表全量重排、两项交换、两类受控三项句式、多步骤 operation plan、`前两个` 相邻引用、title reference 唯一命中移动、title reference 同分歧义本地澄清、标题歧义后的 `第二个` 短回答/候选按钮执行、generation type reference 唯一命中/歧义澄清执行、prompt content reference 唯一命中/歧义澄清执行，以及 asset reference 唯一命中/歧义澄清执行；Slice 211/212/213/214/216/218/219/221 覆盖当前内存态最近引用代词命中、恢复同一本地 conversation 后 `它` 继续命中同一 queued execution、`它前面的那个` 命中最近引用的相邻 queued execution、`它旁边那个` 在左右都有候选时先澄清、澄清后 `前面的/后面的` 短答选择 relation 候选、`刚才那两个` 当前内存态成组移动，以及同一本地 conversation restore 后 `刚才那两个` 继续成组移动；这些测试验证绕过 LLM、active 不变、status 保留、后端 move/reorder payload 正确。 | UI 覆盖仍以离线 DOM/state 为主；尚未做真实 8777 live 联调、拖拽/可编辑计划板联动、完整历史入口、Undo/Replay、跨设备/后端消息更新、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧和复杂多轮指代验收。 |
| `modules/assistant/assistantAgentOrchestrator.js` | 当前已有多 Agent roster、权限校验和 handoff plan；generation agent 未授权时会拒绝 `ai-video` generation action。 | 该模块不是执行时间线 Orchestrator；真正的执行时间线 Orchestrator 是 `modules/assistant/assistantExecutionOrchestrator.js`。后续不要用多 Agent 模块假装完成队列调度、依赖恢复、selected-event skip 之外的恢复语义或 Undo/Replay。 |
| `modules/assistant/assistantActionExecutor.js` | 底层 executor 已能挡未授权视频生成，并能推断目标 nodeType。 | Orchestrator 可复用它做单步执行，但不要把 batch executor 包装成假暂停。 |
| `services/canvas_agent_route_service.py` | 主路由 namespace 是 `/api/v2/canvas-agent/*`；`/api/v2/canvas-agent/executions/*` 已支持 list/get/upsert/append-timeline/update-status/clear-completed，并在 Slice 166 后支持 `PATCH /api/v2/canvas-agent/executions/{id}/queue-control`；Slice 172 后支持 `POST /api/v2/canvas-agent/executions/{id}/prepare`，委托 `execution_service.prepare_queued_execution()`；Slice 196/197 后 queue-control 会转发 `targetIndex/target_index` 与 `orderedIds/ordered_ids` 给 execution service。 | 后续不要再新增 `/api/v2/assistant/executions/*`；前端和 Orchestrator 应接入当前 canvas-agent namespace。`/prepare` 已有默认 server runner wiring；若 PI/LLM runtime 或 provider 配置失败仍会 fail-closed，不能把离线 runner 单测误判成 live 8777 验收。 |
| `services/canvas_agent_execution_service.py` | 后端 Project Execution Store 已支持 list/get/upsert/append-timeline/update-status/clear-completed，并在 Slice 149 后持久化 `orchestratorState` 与 timeline `nodeIds/error/canRetry/canUndo/durationMs`，同时继续脱敏 secret/local path；Slice 166 后 `_sanitize_drawer_state()` 已保留 `queuePaused`，`control_queued_execution()` 支持 `top/pause/resume/cancel`；Slice 196 后支持 `move` + `target_index`；Slice 197 后支持 `reorder` + `ordered_ids`，并在同一 project 内按 queued/queued_draft 队列重排、保留 status、重编号；`list_executions(status=queued)` 会按 `queueIndex` 返回 `queued/queued_draft` 队列顺序；Slice 172 后 `__init__` 支持可选 `prepare_runner`，`prepare_queued_execution()` 会脱敏 payload/context、调用 runner、剥离 raw `context/executionContext` 后持久化 prepared patch；Slice 175 后 `_QUEUE_STATUSES` 已包含 `queued_draft`，draft 只有拿到 fresh `actionsByStep` 才会晋级 `queued`；Slice 180 后 storage reload 会把遗留 `executing` 安全暂停。 | 后续重点是完整历史浏览入口、后端执行链路视频授权 parity、完整依赖重编译/结果合并、真实 8777 live 联调、后端 route/live runner 错误语义、完整跨重启冲突策略、自然语言复杂语义版和 undo/replay 语义；不再把 `/prepare` thin boundary、主浏览器 API 方法、`queued_draft` 状态、move/reorder 队列同步或前端 Orchestrator prepare 错误分类、storage reload 安全暂停当成未完成项，也不能把它们误判成真实模型 live 重编译验收完成。 |
| `services/http_route_dispatcher.py` | dispatcher 对 canvas-agent path 有 allowlist；executions GET/POST/PATCH/DELETE 已放行，因此 Slice 172 的 `POST /api/v2/canvas-agent/executions/{id}/prepare` 走 executions prefix 时可进入 canvas-agent route service。 | 后续新增非 executions prefix 的 canvas-agent 子路由时必须继续同步 allowlist 和测试；本轮未触碰 8777 live 服务。 |

### 2.4 v3.81 真实代码/默会知识复核结论

| 核验点 | 真实代码结论 | PRD 修复后的边界 |
|---|---|---|
| 前端本地 execution store | `assistantExecutionStore.js` 会保存 `nodeIds/canRetry/canUndo/durationMs/orchestratorState` 等执行细节，并做敏感字段清洗。 | 可把“前端本地 store 的执行详情”视为已完成最小闭环。 |
| 后端 execution service | `CanvasAgentExecutionService._sanitize_timeline_event()` 已保留 `nodeIds/error/canRetry/canUndo/durationMs/developer`，并把常见 affected/created/updated/generation node id 数组合并去重；`_sanitize_execution()` 已保留 `orchestratorState.nextActionIndex/pausedAtActionId/running`，且非 executing 状态不会保留 `running=true`；Slice 180 后 `_load()` 会把存储中遗留的 `executing` 恢复为 `paused`、写 `restored_paused` timeline 并持久化，避免服务重启后出现僵尸执行态；`_sanitize_drawer_state()` 已保留 `queuePaused`；`control_queued_execution()` 已支持 `top/pause/resume/cancel/move/reorder`，其中 move 使用 `target_index`，reorder 使用 `ordered_ids`；`list_executions(status=queued)` 会按 `queueIndex` 返回 queued/queued_draft 列表；Slice 172 后新增可注入 `prepare_runner` 的 `prepare_queued_execution()`；Slice 175 后 `_QUEUE_STATUSES` 同时包含 `queued/queued_draft`，且 queued_draft prepare 必须有 fresh actions 才会晋级 `queued`。 | 可把“后端 timeline/orchestrator 扩展字段持久化 + 队列控制后端同步 + move/reorder 队列顺序同步 + prepare thin boundary + 默认 server prepare runner wiring + `queued_draft` 队列/prepare 晋级最小状态机 + 存储重载安全暂停”视为已完成；但不能把完整历史浏览、后端执行链路视频授权 parity、自然语言复杂语义版、真实 8777 live 联调、完整跨重启冲突策略、撤销或 Replay 标为完成。 |
| 抽屉条件按钮 | 旧 `pendingActions` 兼容流仍会在缺少 v2 actions 或缺少 Orchestrator 时降级到 `handleConfirmCard()` / `handleApply()`；v2 execution 的非视频 `确认` 已调用 `executionOrchestrator.run(execution.id, { agentMode, videoAuthorized })`，v2 execution 的 `授权视频` 已在显式 `state.approveVideoGeneration()` 后调用 `executionOrchestrator.run(execution.id, { agentMode, videoAuthorized:true })`，`暂停/继续` 已调用 `pause()/resume()`，抽屉级 `重试` 已调用 `retry(execution.id, { agentMode, videoAuthorized })`；Slice 154 后，选中 timeline event 的“重试此步”已调用 `retry(execution.id, { actionId, eventId, agentMode, videoAuthorized })`；Slice 155 后，选中 timeline event 的“跳过此步”已调用 `skip(execution.id, { actionId, eventId })`；Slice 158 后，选中未授权视频 timeline event 会隐藏普通 retry/skip 并显示“授权视频”，点击后调用 `retry(execution.id, { actionId, eventId, videoAuthorized:true })`。 | 后续必须把 undo 逐步迁入 Orchestrator，并补充视频授权 ledger/后端执行链路 parity；视频授权仍必须显式，Act 模式不能自动授权；selected-event skip、selected-event video auth 与 dependency_blocked 已是最小闭环，但结果合并和完整重编译仍需继续收敛。 |
| 时间线人话化 | Slice 152 后，Orchestrator 对常见技术 action 已生成中文摘要，不再把 `Running:/Completed:/Failed:` 或 `queue_generation_task` 直接写入普通 timeline；原始技术 action 仍保留在 `developer.actionJson`。 | 这是最小 Humanizer，不是完整词库；仍需覆盖更多 action type、错误详情中文化和开发者模式 JSON 面板。 |
| 计划编辑与 DAG | Slice 226 后，展开态计划区在 draft/waiting_confirmation/queued/queued_draft/paused/failed 状态可对未执行步骤“停用/启用”，`setPlanStepEnabled()` 拒绝 executing、已执行步骤和有进度后的重新启用；仍没有拖拽排序、单步执行和 DAG 预览。 | 步骤启停已是最小闭环；排序/单步执行/DAG 预览/编辑后 recompile 仍属后续。 |
| 完整历史入口 | Slice 227 后，关闭完成总结会把 `drawerState.visible` 置 false，抽屉转为“执行历史（N）”入口，最多列出最近 10 条并可点击找回；仍没有搜索、筛选、分页和跨项目历史。 | 最近历史找回已是最小闭环；完整历史浏览（搜索/筛选/分页）仍未完成。 |
| 8777 协作 | 2026-06-11 经用户明确授权，live 联调改由开发执行：本轮在 `8779` 起当前代码实例完成 executions API/重启恢复/restore_node live 验证；确认 `8777` 长驻实例为 2026-06-09 旧代码启动、缺 executions 路由。 | 默认仍不主动碰用户长驻 `8777`（终止该进程仍需人工）；用户需自行重启 `8777` 以加载新功能；后续 live 验收可继续用独立端口实例。 |
| 队列能力 | Slice 162 后，`assistantExecutionStore.enqueueExecution()` 已接入 v2 response 主链路：已有 active execution 时新 execution 会入队；`assistantExecutionOrchestrator` 会在当前 execution 成功完成后自动拉起队列第一项；Slice 163 后，超过 5 个排队任务时展开态会显示“队列较长”软背压提示但仍允许继续入队；Slice 164 后，展开态 queued 任务卡已有“置顶/暂停/继续/取消”前端本地最小控制，且 Orchestrator 会跳过暂停排队任务；Slice 166 后，后端已保存 `queuePaused`，提供 `queue-control` 子路由，前端 API client 和抽屉按钮会 best-effort 同步 `top/pause/resume/cancel`；Slice 169-180 后，Orchestrator 支持 queued 自动执行前 prepare 成功刷新与 prepare 失败 fail-closed，queued_draft 必须 fresh actions 才会执行；Slice 196-209 后，自然语言队列重排已覆盖指定位置移动、完整序数列表全量重排、两项交换、两类受控三项句式、按多个句段顺序执行 swap/move 的 operation plan 首片、前两个/后两个相邻 swap 引用、标题关键词唯一命中移动、标题关键词同分歧义本地文字澄清、标题歧义候选短回答/按钮执行、生成类型语义引用首片、prompt/content 内容语义引用首片，以及资产字段级语义引用首片；Slice 211/212/213/214/216/218/219/221 后，最近一次命中 queued execution 的纯代词 move 支持当前内存态、同一本地 conversation restore 后恢复，前/后相邻 queued execution 指代、`它旁边那个` 左右歧义澄清、澄清后的 `前面的/后面的` relation 短答执行、同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动、同一本地 conversation restore 后最近两个引用重建，以及同一本地会话最近三个明确队列控制对象的 `刚才那三个` 成组移动。 | 仍缺跨设备/后端消息同步的队列澄清与最近引用 metadata、复杂多轮指代、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、拖拽/可编辑计划板联动、完整队列失败/视频/依赖恢复策略、跨重启冲突检测、Undo/Replay 和真实 8777 live 验收。 |
| 自然语言歧义边界 | Slice 182/183/185/186 已完成“带明确作用对象”的本地控制：队列侧必须有 `排队/队列/第/上一个/下一个/最后/all` 等队列提示，当前任务侧必须有 `当前/正在/这个/此/current/active` 等提示。Slice 188 后，缺少作用对象的 `取消任务`、`暂停任务`、`继续任务` 不再落到模型配置 guard，而是在模型 guard、`api.chat/chatStream` 和 LLM 调用前由 `parseNaturalLanguageAmbiguousExecutionControl()` 命中，返回 `clarify/needs_clarification` 并要求用户选当前任务或排队任务。Slice 189-195 已补短回答执行、按钮执行、卡片完成/禁用态、history 恢复、completed card 本地持久回写与旧澄清自动归档。Slice 196-209 已补受控队列重排句式、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词同分歧义本地文字澄清、标题歧义候选短回答/按钮执行、生成类型语义引用首片、prompt/content 内容语义引用首片，以及资产字段级语义引用首片。Slice 211/212/213/214/216/218/219 已补“最近一次明确命中任务”的纯代词 move 当前内存态、同一本地 conversation restore 恢复，前/后相邻项指代首片、`它旁边那个` 左右歧义澄清首片、澄清后的 `前面的/后面的` relation 短答执行首片，同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动首片，以及同一本地 conversation restore 后最近两个引用重建首片、同一本地会话最近三个明确队列控制对象的 `刚才那三个` 成组移动首片。 | 仍不能把任意自然语言队列编辑当成完整语义调度器：连续多次相邻跳转、跨设备 recent reference、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、拖拽计划板联动、失败/视频/依赖队列策略和跨设备消息更新仍未完成。 |
| 计划板能力 | 真实 UI 左侧计划区只读渲染 `plan.steps`，没有启用/禁用、拖拽排序、单步执行、DAG 预览和计划重编译。 | Visual Agent Plan Board 当前是只读 MVP，不能按最终 PRD 的“可编辑计划板”验收。 |
| 时间线操作能力 | Slice 154 后，真实 UI 点击 `canRetry=true` 的 timeline event 会显示“重试此步”；点击后调用 Orchestrator 并传入 `actionId/eventId`，Orchestrator 会按 `actionId` 定位重试 cursor。Slice 155 后，同类 selected event 还会显示“跳过此步”；点击后调用 `orchestrator.skip(executionId, { actionId, eventId })`，写入 `skipped` timeline event 并推进 cursor。Slice 157 后，Orchestrator 会在失败/跳过上游 step 后写入 `dependency_blocked`，暂停依赖下游并继续无依赖后续 action。Slice 158 后，selected video event 会显示“授权视频”并以 `videoAuthorized:true` retry 该 `actionId`。Slice 160 后，选中导致阻塞的源事件会显示“后续 N 步依赖这一步”与后续步骤名。`聚焦对象`仍可用，`canUndo` 仍只是门控元数据。 | timeline 单 action retry/skip/video auth、依赖阻塞和源事件依赖详情最小闭环已完成；undo、重试/跳过后完整 DAG 重编译/结果合并、后端授权 parity 仍未实现。 |
| 新输入排队 | Slice 162 后，`recordAssistantExecutionFromResponse()` 会在已有 active execution 且新 v2 response 不是同一个 execution id 时调用 `executionStore.enqueueExecution()` 入队；Slice 175 后该路径保存为 `queued_draft` 且 `drawerState.visible=false`，避免抢占当前 active 抽屉，并强制轮到执行前 prepare；Slice 163 后，如果入队后排队任务数超过 5，会设置 `drawerState.queueWarning=true` 并在展开态展示“队列较长”；Slice 164 后，用户可在展开态对 queued/queued_draft 任务暂停/继续排队或取消，置顶按钮也能接收 draft target，且 Slice 177 后 mixed queue 置顶会保留其它 queued/draft 任务相对顺序；Slice 166 后这些 queued 控制会 best-effort 同步后端；Slice 169-180 后，若 Orchestrator 构造时传入 prepare hook，队列任务轮到执行前可刷新计划/actions，prepare 失败会 fail-closed；Slice 171 后默认 app 在 `api.prepareQueuedExecution` 存在时会用 latest context 调用显式 prepare API boundary；Slice 172 后后端 thin route/client 已可承接 prepare 请求；Slice 173 后主浏览器 API 已自然接入该 boundary；Slice 174 后默认 server prepare runner 已接入；Slice 175 后无 prepare 或无 fresh actions 会 fail-closed，不执行旧 actions。 | 这覆盖 v2 execution response 的最小排队、软背压提示、队列控制、后端同步、Orchestrator prepare/fail-closed、app latest context API boundary、后端 thin boundary、默认 server runner 和 `queued_draft` 防陈旧执行；旧 actions 兼容流、自然语言跨多轮指代、复杂歧义选择、真实 8777 live 联调仍需后续补齐。 |
| 完成总结关闭 | Slice 227 后，completed 执行的抽屉条件按钮为“关闭”，点击置 `visible=false` 并 best-effort 同步后端；关闭后可从“执行历史（N）”入口找回。 | 已完成最小闭环；关闭动效与总结卡片形态仍是目标态。 |
| 点击外部收起 | Slice 228 后，点击聊天消息区会把展开态抽屉收起为状态条，抽屉保持可见，失败/待授权状态条不消失。 | 聊天区点击收起已验收；画布区域点击、overlay/backdrop 模糊视觉仍未做。 |
| 队列自动拉起实现 | `runNextQueuedExecution()` 读取 `executionStore.snapshot().queue`，跳过 `drawerState.queuePaused=true` 的任务，选中首个非暂停 queued execution；Slice 169 后，如果存在 `prepareQueuedExecution` hook，会在 `run(nextId, { ...options, startActionIndex: 0 })` 之前读取最新 queued execution、调用 hook、持久化返回 patch 并追加 `prepared` timeline；Slice 170 后，prepare 抛错会 fail-closed 为 failed execution 并写 `prepare_failed`，不会执行 stale actions；Slice 179 后，prepare 失败事件会带 `prepareErrorKind/prepareErrorMessage`；Slice 171 后默认 app 可在显式 `api.prepareQueuedExecution` 存在时传入 latest canvas context；Slice 172 后后端 `/prepare` thin boundary 和 `assistantExecutionApiClient.prepareQueuedExecution()` 已可用；Slice 173 后主浏览器 `createCanvasAgentApi().prepareQueuedExecution()` 已可用。 | 可验收“首个非暂停 queued 自动拉起 + 注入 hook 时执行前刷新 plan/actionsByStep + prepare 失败不执行旧 actions + prepare_failed 结构化分类 + 默认 app 显式 API boundary + 后端 thin boundary”；不能验收“默认浏览器主链路已经打到真实模型已重编译”，因为真实 8777 live 联调、跨重启队列一致性和失败策略尚未验收。 |
| queued_draft 状态 | 前端 `AssistantExecutionStatus.QueuedDraft="queued_draft"` 已存在；`sanitizeExecution()/normalizeStatus()` 可保留该状态；`snapshot().queue`、队列排序和 store 队列控制大体识别 `queued`/`queued_draft`；`pauseQueuedExecution()`、`resumeQueuedExecution()`、`cancelQueuedExecution()` 已覆盖 draft；`moveQueuedExecutionToTop()` 可命中 draft target，但重排列表也使用 `isQueueStatus()`，混合 draft 队列置顶顺序已补测试并修复；`appAssistantPanel.js::recordAssistantExecutionFromResponse()` 在已有 active execution 时把新 v2 response 保存为 `queued_draft`；`assistantExecutionOrchestrator.js::runNextQueuedExecution()` 对 `queued_draft` 强制 prepare，且只有 prepare 返回 fresh `actionsByStep` 才晋级 `queued` 并执行；`services/canvas_agent_execution_service.py` 的 `_QUEUE_STATUSES` 也包含 `queued_draft`，后端 list/control/prepare 晋级已覆盖。 | `queued_draft` 最小状态机已可验收为离线代码闭环；但它不等于完整队列产品。仍需真实 8777 live 联调、自然语言控制完整语义版、失败/视频/依赖联动、跨重启冲突处理和完整依赖结果合并。 |
| 最新画布上下文与重编译 | `appAssistantPanel.js` 的 `buildContext({ graphStore })` 当前用于发起聊天、@ 提及菜单，并在 Slice 171 后用于默认 Orchestrator 的 queued prepare hook：当 `api.prepareQueuedExecution` 是函数时，queued/queued_draft 自动执行前会重新构建 context，合并 references/attachments/@ mentions，调用 `api.prepareQueuedExecution({ ...payload, context })`，并把返回的 fresh context 交给后续 `run()`。Slice 169/170 已在 Orchestrator 层支持 prepare 成功刷新和失败 fail-closed；Slice 172 已补 `assistantExecutionApiClient.prepareQueuedExecution()` 与后端 `/prepare` thin boundary；Slice 174 已接入默认 server prepare runner；Slice 175 已强制 `queued_draft` 必须拿 fresh actions 才能执行。 | 这仍不是 live 8777 验收；下一运行时切片应优先围绕复杂局部批量交换、多轮指代、复杂歧义选择、真实服务联调、完整跨重启冲突策略或完整依赖结果合并补强，同时继续保持视频授权不被 Act 模式自动放大。 |
| prepare API thin boundary | `assistantExecutionApiClient.prepareQueuedExecution()`、`CanvasAgentExecutionService.prepare_queued_execution()` 和 `CanvasAgentRouteService` 的 `POST /api/v2/canvas-agent/executions/{id}/prepare` 已通过 focused tests。服务层会脱敏 secret/local path，runner 返回的 `context/executionContext` 不持久化；无 runner 时对已有 execution 返回 501。 | 这是为了把“轮到 queued 任务前重编译”从前端 hook 推到后端边界；Slice 174 已把它接到默认 server 的 `PI_BRIDGE_SERVICE.chat(mode="actions")` 编译链路；仍需 live 8777 联调验证。 |
| prepare 失败 fail-closed | Slice 170 已让 `assistantExecutionOrchestrator: prepare failure stops queued stale actions` 通过：`prepareQueuedExecution` 抛错时阻止 queued stale actions 继续执行，queued execution 进入 `failed`，抽屉保持可见并展示错误，timeline 写 `status:"prepare_failed"` 且 `canRetry:true/canUndo:false`；Slice 179 后该事件还会写入 `developer.prepareErrorKind/prepareErrorMessage`，可区分缺 hook、hook 抛错、返回非法和无 fresh actions。 | 可把 prepare 失败安全门与前端 Orchestrator 错误分类视为最小闭环；后续仍需后端历史/prepare route 同步策略、UI 重试入口优化、完整跨重启冲突策略/自动续跑策略和真实 live runner 错误中文化。 |
| 失败恢复 | `assistantExecutionOrchestrator.js` 已有最小 `dependency_blocked`：执行失败或 skip 上游 step 后，会阻塞依赖它的后续 action，并可继续无依赖后续 action；`appAssistantPanel.js` 会在源事件详情显示“后续 N 步依赖这一步”。 | 这不是完整 DAG 恢复；仍缺 action 输出级依赖、重试/跳过后的下游重编译、结果合并、跨重启恢复、后端执行链路一致性和 Undo。 |
| 右侧时间线详情 | Slice 225 后，详情区对有 inverse 且未撤销的事件渲染“撤销此步”，与聚焦对象/重试/跳过/授权视频并列；仍没有完整开发者 JSON 面板。 | 单步撤销已验收；“撤销到这里”多步回滚与开发者详情面板仍是目标态。 |
| Undo / Replay | Slice 222-225 落地删除型 inverse 与单步撤销；Slice 229 补 update 类 action 的 `restore_node` 属性级 inverse（快照+签名冲突保留）；Slice 230 补 `undoTo()` 多步“撤销到这里”。生成动作仍 `canUndo:false`，无 Replay。 | 位置级（layout/move）inverse、Replay、视频重授权回放仍未做；restore 是 patch 语义不删除 AI 新增 key；无 inverse 的事件继续不显示撤销入口。 |
| PRD 文档结构 | v3.25 中 8.7 “字段边界”存在一行表格残片混入 bullet list，v3.26 修复了该问题；v3.27 继续修复 Orchestrator 职责表列数不一致和 Phase 4/右侧详情容易被误读为已完成的问题。 | 后续接力应把本 PRD 当作“目标态 + 真实边界”文档，不应只读目标体验章节就判定功能已完成。 |

### 2.5 v3.81 方案 B 交互与真实代码差异复核

本节是给接力开发的硬边界：方案 B 是目标产品形态，当前代码只完成了其中一部分。后续开发必须先确认下面的“当前真实状态”，不要把 PRD 目标态当成已经上线。

| 方案 B 要求 | 当前真实代码状态 | 后续实现要求 |
|---|---|---|
| 抽屉固定在输入框上方 | 已落地。`addCompose()` 在 `attachmentListEl` 与输入框主体之间插入 `.hy-canvas-agent-execution-drawer`，无任务时隐藏。 | 保持该位置，不回退到底部大抽屉或聊天消息卡片。 |
| 参考图式“执行信息在输入附近循环/滚动” | 只完成展开态 timeline 内部滚动：`.hy-canvas-agent-execution-timeline` 默认滚到底，用户手动上滚后暂停 5 秒。收起态只是两行静态摘要，不是循环 feed；没有参考图里那种整块内容连续滚动/回放视觉。 | 如要做“循环滚动”，应定义为抽屉内部 execution feed 或 timeline 自动滚动，不能让整个聊天区滚动抢焦点；失败/待确认/视频授权态不得被自动滚过。 |
| 右侧两个操作按钮 | 已有最小闭环。`renderExecutionDrawer()` 右侧渲染“展开/收起”与条件按钮；条件按钮由 `drawerActionLabel()` 决定。 | 当前 CSS 是 grid 右列对齐，不是完整“右下角悬浮按钮组”；如按设计图精修，需要补视觉/布局测试。 |
| 条件按钮作用对象 | 只作用于 `visibleExecutionForDrawer()` 返回的当前可见/active execution；展开态点 queued 卡只切换详情查看，不会让条件按钮指向该 queued item。 | 后续若要对被查看任务执行确认/授权/重试，必须在该任务详情内放明确按钮，并避免误操作当前任务。 |
| 展开态覆盖聊天区并加模糊 | 部分落地（Slice 228）：点击聊天消息区会把展开态收起为状态条且抽屉不消失；CSS 仍没有真实 overlay/backdrop 和 blur 视觉。 | 后续 UI 切片补 overlay/blur 视觉与画布点击行为，并保留失败/待授权强提示状态条。 |
| Visual Agent Plan Board 可编辑 | 部分落地（Slice 226）。计划区可对未执行步骤启用/停用（executing 必须先暂停），切换 best-effort 同步后端 plan；没有拖拽排序、单步执行、DAG 预览或编辑后 recompile。 | 后续补排序/单步执行/recompile 时继续保护“已执行步骤不可改、执行中必须暂停”不变量。 |
| Canvas Operation Timeline 操作 | 已有最小闭环：人话 summary、聚焦对象、selected-event 重试/跳过/视频授权、dependency_blocked 摘要，以及 Slice 225 的 selected-event“撤销此步”（删除型 inverse + 用户修改冲突保留）。 | 仍缺 replay、多步回滚、开发者 JSON 面板、真实 duration、结构化 target 和完整错误中文化。 |
| 自然语言队列/当前任务控制 | 已完成本地最小闭环。Slice 182 后，`sendMessage()` 会先调用本地队列解析器；命中“取消第一个排队任务/把第二个任务置顶/暂停下一个任务/继续暂停任务”等队列指令时，不进入模型配置 guard、不要求 `api.chat/chatStream`，直接复用 execution store 和后端 `queue-control` best-effort 同步。Slice 183 后，`取消全部排队任务` 会一次性取消当前 queued/queued_draft，并逐项同步后端。Slice 185/186 后，当前任务暂停/继续/取消走 active execution Orchestrator 本地控制。Slice 188-195 后，broad `取消任务/暂停任务/继续任务` 已有澄清、短回答、按钮、卡片状态和本地持久回写。Slice 196-209 后，队列重排已支持指定位置移动、完整序数列表全量重排、两项交换、两类受控三项句式、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词同分歧义本地澄清、标题歧义候选短回答/按钮执行、生成类型语义引用首片、prompt/content 内容语义引用首片，以及资产字段级语义引用首片。Slice 211/212/213/214/216/218/219/221 后，最近一次明确命中 queued execution 的纯代词 move 支持当前内存态、同一本地 conversation restore 后恢复，前/后相邻 queued execution 指代、`它旁边那个` 左右歧义澄清、澄清后的 `前面的/后面的` relation 短答执行、同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动、同一本地 conversation restore 后最近两个引用重建，以及同一本地会话最近三个明确队列控制对象的 `刚才那三个` 成组移动。 | 这仍不是完整自然语言计划编辑器；仍缺不同会话/跨设备/后端消息同步、复杂多轮指代、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、拖拽/可编辑计划板联动、真实 8777 live 联调和 Undo/Replay。 |
| 跨重启恢复 | 已有最小安全暂停。前端 local storage、前端导入后端历史、后端 storage reload 都会把遗留 `executing` 改为 `paused` 并保留 cursor。 | 这不是自动续跑；仍需 canvas revision、AI ownership、后端 lease/lock、用户修改冲突检测和人工继续策略。 |
| Skill Registry Studio | 当前只有文件型 v2 skill registry、Claw/PI/Canvas adapter 和离线 runner，没有 Studio UI。 | “Studio”第一版应先做统一定义、校验、调试和命中可视化；不要先做完整 marketplace/后台，也不要把 skill 写成只约束模型的软提示。 |

### 2.6 v3.75-v3.81 本轮 PRD 修复记录

本节连续记录 v3.75 纯 PRD 复核修复、v3.76 运行时推进、v3.77 文档一致性修复、v3.78 运行时推进、v3.79 运行时推进、v3.80 纯 PRD 修复与 v3.81 运行时推进。目标是让接力开发者不会把目标态、历史切片和当前真实代码边界混在一起。

| 修复项 | 真实代码/默会依据 | PRD 现在的约束 |
|---|---|---|
| Slice 214 归属 | `modules/app/appAssistantPanel.js` 中 `queueControlRecentAmbiguousNeighborSource()`、`queueControlRecentNeighborCandidates()` 和 `parseQueueRecentReferenceMoveCommand()` 的旁边歧义分支实际来自 Slice 214；`modules/app/appAssistantPanel.p1Ui.test.js` 的 `ambiguous neighbor of recent queue reference asks before moving` 覆盖该行为。 | 文档里凡是把 `它旁边那个` 写到 Slice 211/212/213 的位置，都必须改成 Slice 211/212/213/214 或明确 Slice 214；后续不要把 Slice 213 的前/后相邻项首片误报为旁边歧义已完成。 |
| 最近引用记忆范围 | `assistantConversationStore.appendMessage()` 保存 `kind/queueControl/executionControl`；`queueControlReferencesFromMessages(messages)` 从同一本地 conversation 历史 assistant message 的 `queueControl.executionId/executionIds` 重建最近 4 个本地队列控制引用；`queueControlReferenceFromMessages(messages)` 返回最后引用及 `recentExecutionIds`。 | 只能验收“同一本地 conversation restore 后最近引用可恢复”和“restore 后最近两个明确引用可用于 `刚才那两个`”；不能写成跨设备、跨后端消息同步、不同 conversation、不同话题长期记忆或任意多轮记忆完成。 |
| 方案 B 抽屉形态 | 真实 UI 已有输入框上方 `.hy-canvas-agent-execution-drawer`、收起态摘要、只读展开态、队列横条、时间线详情和条件按钮；没有完整 overlay/backdrop、点击外部收起、可编辑计划板。 | 方案 B 继续作为目标产品形态；当前只可验收最小抽屉与只读计划/时间线，不能验收“Visual Agent Plan Board 可编辑”。 |
| 时间线能力 | selected-event retry/skip/video authorization、`dependency_blocked` 和源事件依赖摘要已有最小闭环；`canUndo` 仍只是元数据门控。 | Undo/Replay/inverse patch/开发者 JSON 面板仍是后续阶段，不能因为 PRD 目标章节出现“撤销/回放”就标为完成。 |
| 8777 协作 | 用户明确要求：开发者想启动、检查、探测、重启、停止本地 `8777` 时必须停下交给人工；本轮没有触碰服务。 | PRD、验收和接力说明继续保留该规则；需要 live 联调时先让用户处理服务就绪。 |
| CodeGraph 状态 | 默认 `codegraph_status` 返回未初始化，显式 `projectPath` 返回 `database is locked`。 | 结构化检索优先 CodeGraph 的项目规则仍保留；锁未解除前使用 `rg`/定向读取并在文档里标注降级，不自行重建或删除 `.codegraph`。 |
| Slice 216 运行时推进 | `queueControlRecentNeighborCandidates()` 会给旁边澄清候选写入 `relation:"previous"|"next"`；`queueTitleClarificationRelationAnswer()` 识别 `前面的/后面的/上一个/下一个/previous/next`；focused `side answer` 与相关回归已验证。 | 可以验收“旁边歧义澄清后的前/后短答执行”；仍不能验收 `刚才那两个`、连续多次相邻跳转、跨设备 recent reference、资产库搜索、真实 `8777` live 联调或 Undo/Replay。 |
| Slice 217 PRD 一致性修复 | 本轮复核 `modules/app/appAssistantPanel.js`、`modules/app/appAssistantPanel.p1Ui.test.js` 与本 PRD，确认 Slice 216 的 relation 短答执行已在代码和测试中成立，但部分 PRD 段落仍停留在 Slice 214 边界。 | 已把漏写 Slice 216 的方案 B 差异表、9.10 队列规则、Phase 2/3 状态、队列状态机和自检结论修正为 v3.77；本切片不新增功能、不改运行时代码。 |
| Slice 218 运行时推进 | `rememberQueueControlReference()` 现在保留最近 4 个本地队列控制引用；`parseQueueRecentMultiReferenceMoveCommand()` 可在最近引用列表至少有两个不同 queued execution 时解析 `刚才那两个/这两个/both/those two`，并通过完整 `orderedIds` 成组移动。 | 可以验收“同一本地会话最近两个明确队列控制对象的成组移动”；仍不能验收跨会话/跨设备 recent reference、无明确数量多对象、多跳连续相邻指代、资产库搜索、真实 `8777` live 联调或 Undo/Replay。 |
| Slice 219 运行时推进 | `queueControlReferencesFromMessages()` 会从同一本地 conversation 的历史 `queueControl` metadata 重建最近 4 个队列控制引用；`restoreConversation()` 不再只保留最后一个引用，恢复后 `刚才那两个` 可继续走 Slice 218 的本地 `reorder`。 | 可以验收“同一本地 conversation restore 后最近两个明确队列控制对象的成组移动”；仍不能验收不同 conversation、跨设备/后端消息同步 recent reference、无明确数量多对象、多跳连续相邻指代、资产库搜索、真实 `8777` live 联调或 Undo/Replay。 |
| Slice 220 PRD 修复 | 本轮对照 `modules/app/appAssistantPanel.js`、`modules/app/appAssistantPanel.p1Ui.test.js` 与 `modules/assistant/assistantConversationStore.js`，确认 Slice 219 已在真实代码中存在，但 PRD 部分段落仍漏写或仍写成“最近一次引用”。 | 已把版本、状态、方案 B 差异、2.4/2.5/2.6、9.10、Phase 2/3、自检结论统一到 v3.80；本切片不新增运行时能力。 |
| Slice 221 运行时推进 | `queueControlRecentMultiReferenceCount()` 识别最近多引用数量词，`parseQueueRecentMultiReferenceMoveCommand()` 按数量词取最近 N 个引用并要求当前队列足量命中；focused RED/GREEN 覆盖 `把刚才那三个移动到第一个排队任务`。 | 可以验收“同一本地会话最近三个明确队列控制对象的成组移动”；仍不能验收无明确数量的“刚才那几个/那一组”、不同 conversation、跨设备/后端消息同步 recent reference、复杂主题相似度、资产库搜索、真实 `8777` live 联调或 Undo/Replay。 |

v3.91 后接力的优先级建议：生成确认重构已按用户规格落地并 live 验收；下一优先级：①真实 QMAI 项目目录全真验收；②storyboard/action-package 真实工件流；③state.generationTasks 回写；④视频真实生成 live E2E（含新单门确认）；⑤失败自愈受限形态。（v3.90 历史建议：QMAI 接入评审清单已全部落地；下一优先级：①真实 QMAI 项目目录（D:/Backup/Documents/导演wiki 项目）替换 fixture 做全真验收；②storyboard/action-package 真实工件流（QMAI 侧导出）打通 step_shots 分镜落画布；③Orchestrator 回写 state.generationTasks（既有缺口）；④失败自愈受限形态（prepare 重编排已就位）；⑤QMAI 侧消费 receipts 的审片飞轮闭环。（v3.89 历史建议：v3.88 路线五项已全部落地；下一优先级：①Orchestrator 执行路径回写 state.generationTasks（生成任务跟踪/完成通知在抽屉确认路径生效）；②指标历史趋势与独立仪表页；③qualityChecks 运行时强制（不只 examples）；④同义词/向量化触发匹配。（v3.88 历史建议：技能强校验真实链路闭环已完成（回填+重启+live 双向验证+E2E 固化）；下一优先级：①metrics 后端聚合 + 仪表 UI；②图片真实生成场景 live E2E；③DAG 图形化与历史状态 chips；④qualityRules 语义断言；⑤触发词语义化匹配。（v3.87 历史建议：P0-P2 审计条目已全部落地（技能强校验、指标埋点、Replay/重生成、开发者面板、真实耗时+target、DAG、历史分页、共享模型规则、群组引用、真实 LLM E2E + 跨 action 别名修复）；下一优先级：①PI/Claw 响应包装层按本地命中回填 `intent.matchedSkills`（让技能强校验在真实链路生效，当前真实 LLM 响应该字段为空）；②重启长驻 `8777` 以加载 Slice 241 后端强校验；③metrics 后端聚合 + 仪表 UI；④图片真实生成场景 live E2E；⑤DAG 图形化与历史状态 chips；⑥qualityRules 语义断言。（v3.85 历史建议：真实 8777 UI/LLM live 验收已全部完成；下一优先级：①Replay 结构动作；②历史分页/状态 chips；③`layoutStrategy` 回滚与 group 位置联动；④多 JSON 块混排输出的解析增强；⑤gpt-5.5 通道配额恢复后的多模型回归。（v3.84 历史建议：位置级 inverse、Plan Board 拖拽排序、历史搜索、overlay/blur、真实 Chromium UI 验收、LLM 链路修复均已完成。下一优先级：①用户续费 API key 配额后复跑完整 LLM v2 contract live 验收；②用户关闭「幻映工作台1.1.exe」后在字面 8777 端口复跑同一验收脚本；③`layoutStrategy` 回滚与 group 位置联动；④历史分页/状态 chips；⑤Replay。（v3.83 历史建议：属性级 inverse（restore_node）、多步“撤销到这里”、executions API live 首轮联调均已完成；下一优先级建议：①`layout_nodes/move_nodes` 位置级 inverse；②Plan Board 拖拽排序/单步执行/编辑后 recompile；③执行历史搜索/筛选/分页；④展开态 overlay/blur 视觉；⑤浏览器级 UI live 验收（需真实 Chrome 环境）与聊天/LLM 链路 live 联调；⑥提醒用户重启长驻 `8777` 以加载 executions 路由。每个运行时切片继续采用 RED/GREEN，并在本 PRD 与接力文档同步记录完成/未完成边界。

## 3. 目标用户与核心场景

### 3.1 目标用户

| 用户类型 | 典型诉求 |
|---|---|
| 普通创作者 | 用一句话生成图文工作流、分镜、故事、图片，不想理解底层 actions。 |
| 专业视频/图文创作者 | 希望 AI 能自动拆解流程、使用预设、整理画布、复用资产。 |
| 团队成员 | 希望同一个 workflow、skill、模板在不同机器和不同模型链路表现一致。 |
| 开发/接力人员 | 需要看到 AI 的计划、动作、校验、错误和回放数据，方便排错。 |

### 3.2 核心场景

1. 用户输入：“帮我把当前画布整理一下”。
2. 用户输入：“用这个图片资产做一套小红书海报”。
3. 用户输入：“用我的预设提示词生成一个文本节点”。
4. 用户输入：“根据这个故事做 6 个分镜，每个分镜生成一张图”。
5. 用户输入：“继续刚才那个故事，把分镜排整齐”。
6. 用户输入：“撤销到生成第三张图之前”。
7. 用户输入：“这一步失败了，只重试这一步”。

## 4. 产品范围

### 4.1 本期必须做

| 模块 | 范围 |
|---|---|
| Unified Skill Registry | 统一技能定义、加载、匹配、注入、运行时强校验。 |
| 内置 Skills | 画布整理、预设提示词生成、资产使用、故事/分镜工作流。 |
| Intent -> Plan -> Actions | 用户意图、可视计划、可执行动作三层结构。 |
| 计划/时间线抽屉 | 输入框上方独立执行抽屉；收起显示两行状态，执行时日志持续追加，展开后显示任务队列、计划、时间线和详情。 |
| 操作按钮 | 抽屉右下角水平排列：展开按钮 + 条件按钮；条件按钮按状态显示确认、授权视频、暂停、继续或重试。 |
| Plan / Act 模式 | Plan 只计划不执行；Act 自动执行低风险步骤。 |
| 时间线 | 记录每个 action，支持状态、耗时、错误、重试、撤销标记。 |
| Undo | 支持撤销到某个时间线步骤，仅撤销 AI 自己造成的变更。 |
| Replay | 默认不重新生成文本/图片，用户可点“重新生成此步”。 |
| 调试模式 | 普通用户看人话状态，开发者可看 action JSON、校验、错误详情。 |
| 测试 | Skill 离线回归测试 + 真实画布模拟测试。 |

说明：本节是最终产品范围，不代表当前代码均已完成。当前已落地/未落地边界必须以第 2.2、2.5、19、24 节为准。

### 4.2 本期不做

| 不做项 | 原因 |
|---|---|
| 完整可视化 Skill Registry Studio 管理后台 | 第一版优先让统一 skill 定义、校验、命中调试和三链路消费真正影响行动质量；不先做完整 marketplace/重后台。 |
| 用户自由编辑 mini canvas | 计划板第一版只支持启用/禁用和排序，避免复杂度爆炸。 |
| 自动删除生成资产 | 撤销时保留已生成图文资产，避免浪费成本和用户成果。 |
| 视频自动生成 | 视频生成仍必须用户授权。 |
| 外部 skill marketplace | 第一版先做项目内统一 registry。 |
| 所有用户直接看到完整 JSON | 技术细节放入开发者模式。 |

## 5. 总体产品形态

### 5.1 从“聊天面板”升级为“输入框上方执行抽屉”

当前右侧智能体面板保留聊天和输入能力。计划板和时间线不再做底部大抽屉，也不是聊天流里的一条普通消息，而是输入框上方的一块独立执行抽屉。

最终规则：

| 项 | 规则 |
|---|---|
| 位置 | 永远贴着输入框上方，像输入框的上半部分。 |
| 显示时机 | 只要有 AI 计划或执行记录就显示；没有任务时隐藏。 |
| 收起态 | 像输入框的一部分，不明显覆盖聊天。 |
| 展开态 | 在输入框上方原地展开，高度自适应，最高不超过当前面板 70%。 |
| 覆盖关系 | 展开态向上覆盖聊天区域，不改变聊天区域原本布局。 |
| 背景处理 | 覆盖聊天时，背后加轻微渐变/模糊，让用户知道上面有浮层。 |
| 输入框 | 始终可用；执行中发送的新需求全部作为新任务排队。 |
| 点击外部 | 点击抽屉外的聊天区域后，抽屉自动收起到状态条。 |

```text
右侧智能体面板
┌────────────────────────────────────────────┐
│ 聊天消息区                                  │
│ - 用户消息                                  │
│ - 助手回复                                  │
│ - 历史消息                                  │
│                                            │
│  展开态执行抽屉会向上覆盖此区域              │
│  覆盖时背后有轻微渐变/模糊                  │
├────────────────────────────────────────────┤
│ 输入框上方执行抽屉                          │
│ ┌──────────────────────────────────────┐   │
│ │ 第 1 行：任务名 + 进度 + 队列数量      │   │
│ │ 第 2 行：最新状态                      │   │
│ └──────────────────────────────────────┘   │
│                         [展开] [确认/暂停] │
├────────────────────────────────────────────┤
│ 输入框：描述任务，/ 快捷调用，@ 添加上下文   │
└────────────────────────────────────────────┘
```

### 5.2 参考图对应的交互抽象

参考图中的关键特征：

- 信息卡片靠近输入框，不远离用户当前操作焦点。
- 用户可以边看 AI 产物、计划、状态，边继续输入。
- 计划、过程、结果都应该像对话流附近的执行信息，而不是独立跳走到另一个页面。
- 操作按钮靠近输入区域，用户不用移动视线到很远的位置。

本方案将其抽象为“输入框上方执行抽屉”：

```text
无任务：
┌──────────────────────────────┐
│ 聊天区                        │
├──────────────────────────────┤
│ 输入框                        │
└──────────────────────────────┘

有任务收起态：
┌──────────────────────────────┐
│ 聊天区                        │
├──────────────────────────────┤
│ 执行中：分镜生成 3/8，队列中 2 │
│ 最新：正在生成关键帧 03        │
│                    [展开][暂停]│
├──────────────────────────────┤
│ 输入框                        │
└──────────────────────────────┘

展开态：
┌──────────────────────────────┐
│ 聊天区被轻微渐变/模糊覆盖       │
│ ┌──────────────────────────┐ │
│ │ 顶部任务队列横条          │ │
│ ├───────────┬──────────────┤ │
│ │ 左：计划   │ 右：时间线/详情 │ │
│ └───────────┴──────────────┘ │
├──────────────────────────────┤
│ 输入框                        │
└──────────────────────────────┘
```

### 5.3 交互总览

| 阶段 | 抽屉主内容 | 滚动方式 | 操作按钮 |
|---|---|---|---|
| 未执行前 | 计划摘要 | 不自动滚动 | 展开；Plan 模式显示确认计划 |
| 执行中 | 时间线日志 | 持续追加并自动滚到底部 | 展开；暂停 |
| 手动查看旧日志 | 时间线旧记录 | 暂停自动滚动 5 秒，之后自动回到底部 | 展开；暂停 |
| 待确认 | 待确认摘要 | 不自动滚过 | 展开；确认或授权视频 |
| 失败 | 失败摘要 | 停留在失败项 | 展开；重试 |
| 完成 | 最近一次任务总结 | 不自动滚动 | 展开；可关闭总结 |

## 6. Plan / Act 模式规则

| 模式 | 行为 |
|---|---|
| Plan 模式 | 永远先生成计划板，不直接改画布。 |
| Act 模式 | 生成计划板后自动开始执行低风险步骤，时间线同步滚动。 |

### 6.1 Act 模式允许直接执行的动作

| 动作类型 | 是否可直接执行 |
|---|---|
| 生成故事大纲 | 是 |
| 生成分镜文本 | 是 |
| 创建文本节点 | 是 |
| 创建图片节点 | 是 |
| 生成文本 | 是 |
| 生成图片 | 是 |
| 使用预设提示词 | 是 |
| 绑定资产引用 | 是 |
| 节点连线 | 是 |
| 自动整理画布 | 是 |
| 视频节点草稿 | 是 |
| 视频生成 | 否，必须确认 |
| 删除用户内容 | 否，默认不做 |
| 文件/系统/shell 操作 | 禁止 |

### 6.2 视频确认规则

当计划包含视频生成时，计划可以自动走到“视频待授权”步骤，但不得直接触发视频生成。

```text
故事大纲 -> 分镜文本 -> 图片关键帧 -> 视频节点草稿 -> 等待视频授权
```

确认按钮文案：

| 场景 | 按钮文案 |
|---|---|
| 只有低风险步骤 | 执行 |
| Act 模式自动执行中 | 暂停 / 继续 |
| 有视频待授权 | 授权视频 |
| 有高风险步骤 | 确认执行 |
| 执行失败 | 重试失败步骤 |

硬性安全线：

- `Act` 模式不等于视频授权。
- `Act` 模式只允许低风险步骤自动推进；视频生成必须进入 `waiting_video_authorization` 或同等待授权状态。
- 授权来源只能是用户点击文案明确为“授权视频”的按钮，或用户在当前上下文中用自然语言明确授权当前视频生成项。
- 一次授权只作用于当前最近的一个视频生成项，不批量授权后续视频项。
- 已删除历史兼容逻辑：`modules/app/appAssistantPanel.js` 不再把 `state.agentMode === "act"` 视为 `videoAuthorized=true`。验收已覆盖“Act 模式含视频计划但未点授权视频时，不触发视频生成”。
- 当前真实代码中还存在 schema 兼容债：`services/canvas_agent_action_schema.py` 会把 `start_generation` 视作 proposal-level action，并在父级 schema 校验时临时放宽 `video_authorized`。如果 `start_generation` 用在视频节点，最终 action 必须被标为 `requiresConfirmation=true/riskLevel=high`，且 Orchestrator/executor 不得执行。后续应优先减少模型使用 `start_generation`，统一使用 `queue_generation_task` 并显式授权。
- 已修复 Canvas Skills registry 兼容债：`modules/assistant/canvasSkills/registry.js::shouldConfirmCanvasSkillBatch()` 现在先判断视频生成，再应用 Act 模式低风险自动推进规则；视频永远确认，Act 只影响文本/图片/布局等低风险动作。

## 7. Unified Skill Registry

### 7.1 定位

Unified Skill Registry 是完整技能系统，不是单纯提示词库。它的核心目标是：

```text
用户自然语言指令 -> 意图识别 -> 技能匹配 -> 可视计划 -> 可执行画布 actions
```

其它目标包括：

- Auto Layout Pro 高级画布整理。
- 预设提示词调用稳定化。
- 资产查找和使用稳定化。
- 故事/分镜工作流稳定化。
- Claw、PI、Canvas Skills 共用一套技能定义。

### 7.2 技能层级

第一版采用两层结构：

```text
场景技能 Scenario Skill
  │
  ├─ 负责理解用户目标
  ├─ 负责拆解计划
  ├─ 负责选择动作范围
  ├─ 负责质量标准
  │
  v
原子画布技能 Atomic Canvas Skill
  │
  ├─ 创建节点
  ├─ 更新节点
  ├─ 连线
  ├─ 生成
  ├─ 资产引用
  └─ 布局
```

### 7.3 第一版内置技能

| Skill | 类型 | 目标 |
|---|---|---|
| `canvas_layout` | 场景技能 | 高级画布整理，输出布局、移动、分组、聚焦动作。 |
| `prompt_preset_generation` | 场景技能 | 使用文本/图片预设提示词直接生成，不把模板暴露给用户。 |
| `asset_usage` | 场景技能 | 查找、选择、绑定、使用画布资产。 |
| `storyboard_workflow` | 场景技能 | 将一句话故事需求拆成大纲、角色/风格、分镜、图片关键帧、视频待授权。 |
| `node_create` | 原子技能 | 创建文本/图片/视频/辅助节点。 |
| `node_update` | 原子技能 | 更新节点字段。 |
| `node_connect` | 原子技能 | 创建边和连接关系。 |
| `node_generate` | 原子技能 | 触发文本/图片生成，视频生成需授权。 |
| `node_layout` | 原子技能 | 布局、移动、分组、聚焦。 |
| `asset_bind` | 原子技能 | 绑定资产和参考图。 |

实现边界：

- 当前已经真实落地为 v2 目录的是四个场景技能：`canvas_layout`、`prompt_preset_generation`、`asset_usage`、`storyboard_workflow`。
- `node_create/node_update/node_connect/node_generate/node_layout/asset_bind` 第一版是“逻辑原子技能”，由 `modules/assistant/canvasSkills/manifest.js` 中的稳定 Canvas Skills id 承载，不要求立刻创建同名 v2 目录。
- 如果后续把原子技能也做成 v2 目录，必须保持与 Canvas Skills manifest 的 id/permission/schema 一致，不能出现两套互相冲突的原子能力定义。

### 7.4 Skill 文件结构

每个 skill 是一个目录：

```text
config/assistant-skills-v2/
  canvas_layout/
    skill.json
    instructions.md
    examples.json
    tests.json
  prompt_preset_generation/
    skill.json
    instructions.md
    examples.json
    tests.json
  asset_usage/
    skill.json
    instructions.md
    examples.json
    tests.json
  storyboard_workflow/
    skill.json
    instructions.md
    examples.json
    tests.json
```

兼容要求：

- 第一版不能删除或忽略现有 `config/assistant-skills/*.json`。
- 新 loader 必须同时支持旧目录和 v2 目录，并把旧字段迁移成 v2 内部结构。
- v2 生效顺序：项目级 v2 skill > 内置 v2 skill > 旧扁平 skill。
- 如果同一 `id` 同时存在旧版和 v2，默认使用 v2，同时在开发者模式记录迁移提示。
- 所有 skill 文件必须使用 UTF-8 或 UTF-8 with BOM 读取，中文内容不得出现 mojibake。

当前实现边界：

- 已实现：默认内置 v2 skill 覆盖旧扁平 skill；显式测试目录不会被默认 v2 污染。
- 已实现：`tests.json` 最小 offline runner，可验证内置 v2 skill 命中。
- 未实现：项目级 v2 skill override、开发者迁移提示、allowedActions/forbiddenActions/qualityRules 深度断言和真实画布 fixture 模拟。
- 接力开发不得因为 `config/assistant-skills-v2` 已存在就宣称 Unified Skill Registry 完成；三条 adapter、合同透传和视频安全收口才是 Phase 1 完成标准。

#### skill.json

机器可校验字段。

```json
{
  "id": "canvas_layout",
  "name": "高级画布整理",
  "version": "1.0.0",
  "type": "scenario",
  "enabled": true,
  "priority": 90,
  "triggers": ["整理画布", "自动排版", "画布太乱", "整理节点"],
  "requiredContext": [
    "canvas.nodes",
    "canvas.edges",
    "canvas.layoutHints",
    "canvas.selection",
    "canvas.diagnostics"
  ],
  "allowedActions": [
    "layout_nodes",
    "move_nodes",
    "create_group",
    "rename_node",
    "focus_nodes"
  ],
  "forbiddenActions": [
    "delete_nodes",
    "queue_video_generation",
    "write_file",
    "shell_command"
  ],
  "qualityRules": [
    "优先整理当前选区",
    "保持输入、处理、输出的流向清晰",
    "同一镜头或同一工作流的节点应相邻",
    "减少节点重叠和连线交叉",
    "不得修改 prompt、模型、资产、生成结果"
  ],
  "riskLevel": "low",
  "requiresConfirmation": false
}
```

#### instructions.md

给模型的详细做事方法，写“如何做好”，不是只写限制。

```text
当用户要求整理画布时：
1. 先判断整理范围：选区、当前工作流、问题节点、全画布。
2. 再识别语义层级：输入、文本、图片、视频、资产、失败节点。
3. 再选择布局策略：单链路、分支、分镜网格、资产区、问题区。
4. 最后输出 layout/move/group/focus actions。
5. 不要触发任何生成，不要删除用户内容。
```

#### examples.json

结构化示例。

```json
[
  {
    "input": "帮我整理当前选中的分镜节点",
    "expectedIntent": "canvas_layout",
    "expectedPlanSteps": ["识别选区", "按 shotIndex 排列", "聚焦整理结果"],
    "expectedActions": ["layout_nodes", "focus_nodes"]
  }
]
```

#### tests.json

回归测试定义。

```json
[
  {
    "id": "layout_selected_storyboard_nodes",
    "input": "整理当前这些分镜节点",
    "fixture": "storyboard_6_shots_messy_canvas.json",
    "assert": {
      "mustUseSkill": "canvas_layout",
      "allowedActionsOnly": true,
      "mustNotGenerate": true,
      "mustRespectSelection": true
    }
  }
]
```

### 7.5 Skill 运行时强校验

Skill 不是软提示。运行时必须校验：

| 校验项 | 说明 |
|---|---|
| requiredContext | 缺少关键上下文时，计划步骤进入等待上下文或降级态。 |
| allowedActions | Skill 输出的 actions 只能在允许范围内。 |
| forbiddenActions | 命中禁用动作直接拦截。 |
| qualityRules | 生成计划和 actions 后进行质量自检。 |
| riskLevel | 高风险动作进入确认态。 |
| requiresConfirmation | 需要确认时，右侧按钮显示确认。 |

字段兼容规则：

| v2 字段 | 旧字段或当前代码字段 | 规则 |
|---|---|---|
| `instructions` | `body` / `compactBody` | 旧 skill 读取后转换为 instructions；compact 版本仍用于长上下文压缩。 |
| `qualityRules` | `qualityRubric` | 两者同义；内部统一成 `qualityRules`，旧字段继续读取。 |
| `allowedActions` | `allowedActions` | 保持同名；同时映射到 PI allowed actions 和后端 schema 白名单。 |
| `forbiddenActions` | `forbiddenActions` | 保持同名；命中后直接拦截，不只提醒模型。 |
| `requiredContext` | `requiredContext` | 缺失时计划步骤进入等待上下文，不允许硬编。 |

### 7.6 三条运行时适配器

Unified Skill Registry 必须同时接入 Claw、PI、Canvas Skills，不能只完成文件加载。

| Adapter | 接入位置 | 输入 | 输出 | 验收 |
|---|---|---|---|---|
| Claw Skill Adapter | `services/claw_bridge_service.py` / `services/claw_skill_registry_service.py` | 用户消息、画布上下文、v2 skill | `assistantSkills` prompt payload、skill warnings、matched skill ids、v2 合同字段 | 已完成 v2 loader、prompt 注入和 `parse_claw_output()` v2 字段透传/清洗；后续由执行抽屉/Orchestrator 消费。 |
| PI Skill Adapter | `integrations/pi_canvas_agent/src/huanyingTools.ts/js`、`piClient.ts/js`、`protocol.ts/js` | v2 skill 的 allowed actions、instructions、risk rules | PI system prompt 片段、tool guard、response contract | 已完成 `huanyingTools` adapter、真实 `piClient` 默认 v2 加载、protocol/safeResponse v2 透传；后续由 execution store/timeline 消费。 |
| Canvas Skills Adapter | `modules/assistant/canvasSkills/registry.js`、`index.js`、`manifest.js`、`assistantCanvasSkillRegistry.js` | v2 skill action、Canvas skill manifest、action nodeType | Canvas skill id、permission、schema、trace | 已完成 `canvasSkillIdsForV2Skill()` / `canvasSkillCallsForV2Skill()` 最小映射；`imageNode.generate`、`textNode.generate`、`videoNode.generate` 等继续走现有 Canvas Skills runtime；Act 模式下真实视频生成仍需确认的前端/preview/Canvas Skill policy 最小闭环已完成。 |

适配器边界：

- Unified Skill Registry 负责“用户意图到计划和 actions 的编译规则”。
- Canvas Skills 负责“具体画布能力的 schema、权限、runtime、trace”。
- Action Schema 负责“最终可执行 action 的安全校验”。
- Execution Orchestrator 负责“队列、时间线、暂停、重试、撤销、回放”。

Canvas Skills Adapter 最小映射要求：

| v2 skill / action | nodeType 或上下文 | Canvas Skills id |
|---|---|---|
| `prompt_preset_generation` + `run_prompt_preset_generation` | `ai-image` | `imageNode.applyPreset` |
| `prompt_preset_generation` + `run_prompt_preset_generation` | `ai-text` | `textNode.applyPreset` |
| `prompt_preset_generation` + `run_prompt_preset_generation` | `ai-video` | `videoNode.applyPreset`，但必须保留确认需求 |
| `node_generate` 或 generation action | `ai-image` | `imageNode.generate` |
| `node_generate` 或 generation action | `ai-text` | `textNode.generate` |
| `node_generate` 或 generation action | `ai-video` | `videoNode.generate`，必须保留 `requiresConfirmation=true` |
| `asset_usage` / `asset_bind` | 资产引用、参考图绑定 | `asset.use` 或 `node.bindReferences` |
| `canvas_layout` / `node_layout` | 布局、移动、聚焦 | 走旧 action executor 的 `layout_nodes/move_nodes/focus_nodes`，直到 Canvas Skills manifest 明确新增 layout skill id |

## 8. Intent -> Plan -> Actions

### 8.1 三层结构

```text
Intent
  │  用户到底想完成什么
  v
Plan
  │  用户可理解、可启用/禁用、可排序的计划步骤
  v
Actions
     系统可执行的画布操作指令
```

### 8.2 数据流

```text
用户输入
  │
  v
Context Builder 提取画布上下文
  │
  v
Skill Registry 匹配技能
  │
  v
Intent 识别
  │
  v
Plan 生成
  │
  v
Action Draft 生成
  │
  v
执行前重新读取最新画布
  │
  v
必要时重编译受影响步骤
  │
  v
Executable Actions
  │
  v
Canvas Skills / Executor 执行
  │
  v
Timeline 记录
```

### 8.3 Intent 数据结构

```json
{
  "id": "intent_20260609_001",
  "conversationId": "conv_001",
  "projectId": "project_001",
  "mode": "act",
  "rawUserInput": "帮我根据这个故事做 6 个分镜并生成图片",
  "normalizedGoal": "创建故事分镜工作流并生成关键帧图片",
  "matchedSkills": ["storyboard_workflow", "prompt_preset_generation", "canvas_layout"],
  "riskSummary": {
    "hasVideoGeneration": false,
    "hasDeletion": false,
    "requiresConfirmation": false
  },
  "createdAt": "2026-06-09T12:00:00+08:00"
}
```

### 8.4 Plan 数据结构

```json
{
  "id": "plan_001",
  "intentId": "intent_20260609_001",
  "title": "6 镜头故事分镜与关键帧生成",
  "mode": "act",
  "status": "executing",
  "steps": [
    {
      "id": "step_outline",
      "title": "生成故事大纲",
      "skillId": "storyboard_workflow",
      "enabled": true,
      "order": 1,
      "status": "success",
      "dependsOn": [],
      "summary": "创建一个故事大纲文本节点",
      "estimatedActions": 2,
      "requiresConfirmation": false
    },
    {
      "id": "step_shots",
      "title": "生成 6 个分镜文本",
      "skillId": "storyboard_workflow",
      "enabled": true,
      "order": 2,
      "status": "executing",
      "dependsOn": ["step_outline"],
      "summary": "每个镜头一个分镜文本节点",
      "estimatedActions": 12,
      "requiresConfirmation": false
    }
  ],
  "canvasPreview": {
    "type": "simple_dag",
    "nodes": [],
    "edges": [],
    "groups": []
  }
}
```

### 8.5 Action 数据结构

```json
{
  "id": "action_001",
  "planId": "plan_001",
  "stepId": "step_shots",
  "type": "create_node",
  "status": "pending",
  "target": {
    "nodeType": "ai-text",
    "title": "分镜 01"
  },
  "payload": {
    "positionStrategy": "storyboard_grid",
    "data": {
      "prompt": "..."
    }
  },
  "source": {
    "skillId": "storyboard_workflow",
    "compiledFrom": "plan_step"
  },
  "safety": {
    "riskLevel": "low",
    "requiresConfirmation": false
  }
}
```

### 8.6 Assistant Response Contract

当前真实代码的旧合同是：

```json
{
  "reply": "string",
  "actions": [],
  "warnings": [],
  "requiresConfirmation": false
}
```

新主线必须升级为以下合同，同时兼容旧 `actions`：

```json
{
  "reply": "给用户看的简短说明",
  "intent": {
    "id": "intent_20260609_001",
    "mode": "act",
    "matchedSkills": ["storyboard_workflow"],
    "riskSummary": {
      "hasVideoGeneration": true,
      "requiresConfirmation": true
    }
  },
  "plan": {
    "id": "plan_001",
    "title": "6 镜头故事分镜与关键帧生成",
    "status": "draft",
    "steps": []
  },
  "actionsByStep": {
    "step_outline": [],
    "step_shots": [],
    "step_keyframes": []
  },
  "actions": [],
  "execution": {
    "id": "exec_001",
    "status": "draft",
    "queueIndex": 0,
    "drawerState": {
      "visible": true,
      "expanded": false
    }
  },
  "warnings": [],
  "requiresConfirmation": false,
  "developer": {
    "rawModelContractVersion": "v2",
    "skillWarnings": []
  }
}
```

合同规则：

- `actions` 是旧兼容字段，等于所有 enabled step 的 action 展平结果。
- 新 UI 优先读 `intent/plan/actionsByStep/execution`；只有缺失时才降级读取旧 `actions`。
- `actionsByStep` 必须能反查每个 action 属于哪个 plan step，时间线才能显示依赖、重试、跳过和暂停。
- `requiresConfirmation` 是整体摘要；单步确认以 `plan.steps[].requiresConfirmation` 和 action `safety.requiresConfirmation` 为准。
- API key、完整 prompt preset 模板、本地绝对路径不得进入该合同。
- 普通用户 UI 不展示技术 action 名；开发者模式才能查看 `actions` JSON。

当前真实代码状态与剩余工作：

| 模块 | 当前真实代码状态 | 剩余工作 |
|---|---|---|
| 前端协议 | `modules/assistant/assistantProtocol.js::normalizeAssistantResponse()` 和 `normalizeAssistantStreamFrame(message.done)` 已白名单透传并清洗 `intent/plan/actionsByStep/execution/developer`，同时继续兼容旧 `actions`。 | `appAssistantPanel.js` 已把 v2 response 写入 `assistantExecutionStore`，输入框上方抽屉已读取 store 并展示收起态、只读计划/时间线和“授权视频”按钮；Orchestrator 已持续更新执行状态和 timeline，并已接入 selected-event retry/skip/video authorization。下一步保持旧 `actions` 兼容，同时补完整依赖重编译/结果合并、完整历史入口和 Undo/Replay。 |
| PI protocol | `integrations/pi_canvas_agent/src/protocol.ts/js::safeResponse()`、`safeStreamFrame()` 已允许 response 和 `message.done` frame 携带 v2 字段，且过滤 secrets/path。 | 后续只需保持 TS/JS mirror 同步，不再重复做协议透传。 |
| PI model parser | `integrations/pi_canvas_agent/src/piClient.ts/js::responseFromModelText()` 已从模型 JSON 读取 v2 字段；若只有旧 actions，会自动生成最小 plan wrapper。 | 后续 Orchestrator 要基于 `actionsByStep` 做逐步执行，而不是继续整批 apply。 |
| PI bridge | `services/pi_bridge_service.py::_sanitize_response()` 和 stream `message.done` 已保留并清洗 v2 字段；真实执行前仍运行 action schema 校验。 | 后续 execution store/timeline 需要保存 schema 结果与人话摘要。 |
| Claw parser | `services/claw_bridge_service.py::parse_claw_output()` 已不再只返回旧四字段，已保留并清洗 v2 字段；`chat()` 仍对实际 `actions` 走 schema 校验。 | 后续需要在 Orchestrator 层确保 `actionsByStep` 与最终 `actions` 一致，并对实际执行动作逐步校验。 |
| 前端状态 | `modules/app/appAssistantPanel.js` 仍以 `pendingActions`、preview card、apply button、interaction card 作为底层兼容流；`lastResponse` 可拿到 v2 字段，v2 response 已写入项目级 `assistantExecutionStore`，输入框上方执行抽屉已从 store 读取并展示；收到 v2 response 后还会通过 `assistantExecutionApiClient` 尽力写入后端 execution route；v2 抽屉确认/授权视频/暂停/继续/重试已调用真实 Execution Orchestrator，selected-event “重试此步/跳过此步/授权视频”也已调用真实 Orchestrator，源事件依赖详情已能读取 `dependency_blocked` events。 | 下一步是补抽屉高级交互、完整依赖重编译/结果合并、完整历史入口和 Undo/Replay；不能把当前只读/半执行工作台当成完整执行工作台。 |

### 8.7 Execution Orchestrator

由于当前 `executeAssistantActions` 是整批执行循环，本 PRD 已新增 `assistantExecutionOrchestrator.js` 执行编排层；后续仍不能让 UI 直接依赖旧 batch executor 实现暂停、继续、重试和时间线。

```text
Assistant Response Contract
  -> Project Execution Store
  -> Execution Orchestrator
  -> 单步 validate
  -> 底层 Action Executor / Canvas Skills Runtime
  -> Timeline Event
  -> Drawer Render
```

Orchestrator 职责与当前边界：

| 职责 | 当前真实状态 | 后续边界 |
|---|---|---|
| 编译 | `compilePlanActions()` 已把 `plan.steps + actionsByStep` 编译成逐 action 序列，并跳过 disabled step/action。 | 仍缺计划编辑后的重新编译、action 输出级依赖和完整 DAG 重编译。 |
| 调度 | `run()` 同一时间只允许一个 active execution；当前任务完成后 `runNextQueuedExecution()` 会自动拉起首个非暂停 queued/queued_draft 任务；Slice 169-180 后可在拉起前调用注入的 `prepareQueuedExecution` 刷新 queued execution，prepare 抛错会 fail-closed；Slice 171 后默认 app 在显式 `api.prepareQueuedExecution` 存在时会传入 latest context；Slice 172 后 execution client 与后端 `/prepare` thin boundary 已存在；Slice 173 后主浏览器 API prepare 暴露已存在；Slice 174 后默认 server prepare runner 已接入；Slice 175 后 queued_draft 无 prepare 或无 fresh actions 会 fail-closed，不执行旧 actions。 | 仍缺真实 8777 live 联调、自然语言控制完整语义版、失败/视频/依赖场景下的完整队列策略。 |
| 逐步执行 | 每个 action 执行前调用 `validateActions()`，再调用 `executeActions()`，并写 running/completed/failed timeline event。 | 仍缺真实 action duration 计算、结构化 target 对象和更多 action type 的人话摘要。 |
| 暂停/继续 | `pause()` 不强杀当前 action，会在当前 action 完成后停在 cursor；`resume()` 从 `orchestratorState.nextActionIndex` 继续；Slice 180 后，重启后遗留的 executing 会安全恢复为 paused。 | 仍缺复杂生成任务取消/暂停语义和完整跨重启冲突策略。 |
| 重试 | 已完成 failed execution cursor-level retry；Slice 154 后可按 selected timeline event 的 `actionId` 定位 retry；未授权视频 retry 会停在 `waiting_video_authorization`。 | 仍缺重试后的下游依赖重编译、结果合并、后端执行链路授权 parity。 |
| 跳过 | Slice 155 已完成 selected-event skip，写入 `skipped` timeline event 并推进 cursor；Slice 157 后跳过上游 step 会阻塞依赖下游。 | 仍缺跳过后的下游重编译、队列联动和 Undo inverse。 |
| 依赖处理 | 已完成最小 `dependency_blocked`：无依赖后续可继续，有依赖后续暂停并可在详情中看到“后续 N 步依赖这一步”。 | 仍缺 action 输出级依赖、DAG 结果合并、跨重启后的依赖冲突处理和完整依赖详情。 |
| 安全授权 | 视频 retry 安全门已在 Orchestrator 层再次判断；前端 v2 授权视频路径显式传 `videoAuthorized:true`。 | 后端执行链路和未来 replay/dependency 恢复路径必须重复校验，Act 模式仍不得自动授权视频。 |
| Undo/Replay | 当前只保留 `canUndo` 门控字段，Orchestrator completed event 默认 `canUndo:false`。 | Phase 4 尚未落地；没有 inverse patch、AI ownership、冲突检测、replay 元数据或 UI。 |

当前最小事件格式必须以真实代码为准：

```json
{
  "id": "evt_001",
  "stepId": "step_shots",
  "actionId": "action_001",
  "status": "running | completed | failed | skipped | dependency_blocked | prepared | prepare_failed | waiting_video_authorization",
  "humanSummary": "已完成：创建分镜 01 文本节点",
  "nodeIds": ["shot_text_01"],
  "durationMs": 0,
  "error": "",
  "canRetry": true,
  "canUndo": false,
  "createdAt": "2026-06-09T12:00:00+08:00",
  "updatedAt": "2026-06-09T12:00:01+08:00",
  "developer": {
    "actionJson": { "type": "create_node" },
    "validation": {},
    "result": {}
  }
}
```

字段边界：

- 前端 `assistantExecutionStore.sanitizeTimelineEvent()` 当前会保留 `nodeIds/error/canRetry/canUndo/durationMs/developer`。
- 后端 `CanvasAgentExecutionService._sanitize_timeline_event()` 已保留 `nodeIds/error/canRetry/canUndo/durationMs/developer`，并把常见 affected/created/updated/generation node id 数组合并去重。
- 后端 `_sanitize_execution()` 已保留 `orchestratorState.nextActionIndex/pausedAtActionId/running`，且非 executing 状态不会保留 `running=true`。
- 后端 `_sanitize_drawer_state()` 已保留 `queuePaused`；`control_queued_execution()` 已支持 `top/pause/resume/cancel`；`list_executions(status=queued)` 会按 `queueIndex` 返回 `queued/queued_draft` 队列列表。
- 以上字段只代表后端历史导入不丢聚焦、重试/撤销 gating 和 pause cursor 的基础依据；完整历史浏览、后端执行链路视频授权 parity、完整依赖结果合并、Undo inverse patch 和 Replay 仍未成立。
- 若未来新增 `kind/humanText/target/startedAt/finishedAt`，必须兼容现有 `status/humanSummary/nodeIds`，不能破坏已落地的前端 store。

## 9. 计划/时间线执行抽屉

### 9.1 核心定义

计划板和时间线统一由输入框上方的“执行抽屉”承载。默认抽屉只显示当前任务的摘要和最新状态；展开后才显示完整任务队列、计划、时间线和详情。

最终交互选择：

| 问题 | 定稿规则 |
|---|---|
| 位置 | 输入框上方独立区域，永远贴着输入框，像输入框的上半部分。 |
| 视图 | 默认一个抽屉；展开后才分出计划、时间线、详情。 |
| 默认显示 | 按阶段切换：未执行前显示计划，执行中显示时间线，完成后显示总结。 |
| 日志文字 | 普通用户只看人话，不显示技术 action 名称。 |
| 点击记录 | 点击后展开并进入详情区域，详情里提供聚焦、重试、撤销等操作。 |
| 展开形态 | 在输入框上方原地展开，高度变高，仍在当前面板内。 |
| 展开布局 | 顶部任务队列横条；下方左侧计划，右侧时间线/详情。 |
| 外部点击 | 点击聊天区域后自动收起到状态条。 |

当前真实代码差异：外部点击收起、聊天区 overlay/backdrop blur、完成态手动关闭按钮均未在 `appAssistantPanel.js` 中形成闭环；当前只是抽屉在输入框上方显示/展开。

### 9.2 显示与隐藏

| 场景 | 抽屉行为 |
|---|---|
| 没有计划、没有执行记录 | 隐藏。 |
| 有计划未执行 | 显示计划摘要。 |
| 任务执行中 | 显示当前任务进度和最新状态。 |
| 有排队任务 | 默认抽屉只显示队列数量，不展开全部队列。 |
| 有待确认项 | 默认抽屉提示“有 1 项待确认”，条件按钮出现。 |
| 有失败项 | 默认抽屉显示失败摘要和影响提示。 |
| 任务完成 | 保留最近一次任务总结；下一次任务开始时自动替换。 |
| 用户关闭完成总结 | 抽屉隐藏；聊天历史保留摘要，项目级 AI 执行历史保留完整计划/时间线。 |

收起例外：

- 有视频待授权时，点击聊天区只能收起到强提示状态条，不能完全隐藏。
- 有阻塞失败时，点击聊天区只能收起到失败状态条，不能完全隐藏。
- 有未处理的高风险确认时，状态条必须保留条件按钮。
- 用户手动关闭完成总结后才能完全隐藏完成态抽屉。

### 9.3 收起态内容

收起态显示两行：

```text
第一行：任务名 + 进度 + 队列数量
第二行：最新状态
```

示例：

```text
分镜生成工作流 3/8，队列中 2 个
正在生成关键帧 03
```

要求：

- 默认只显示当前任务，不显示所有排队任务。
- 队列数量超过 0 时显示“队列中 N 个”。
- 当前真实代码不会自动把队列数量拼进 `drawerState.line1`；如果模型/prepare patch 没写入该文案，收起态只显示 title/progress。后续要补真实队列数量需在 `renderExecutionDrawer()` 基于 `executionStore.snapshot().queue` 合成并加测试。
- 队列超过 5 个时显示“队列较长”提示，但仍允许继续加入队列。
- 收起态不提供计划编辑。
- 收起态像输入框的一部分，不明显覆盖聊天。

### 9.4 高度规则

| 状态 | 高度规则 |
|---|---|
| 摘要态 | 较矮，只容纳两行状态和操作按钮。 |
| 执行中 | 中等高度，展示当前任务摘要和最新状态。 |
| 失败/确认 | 自动变高，展示失败或确认摘要。 |
| 展开态 | 内容自适应，最高不超过面板高度 70%。 |

展开态覆盖聊天区域，但不改变聊天区域布局。覆盖区域背后加轻微渐变/模糊。

### 9.5 滚动规则

执行中时间线像日志一样持续向下追加，并默认自动滚到底部。

| 场景 | 行为 |
|---|---|
| 正常执行 | 新日志追加后自动滚到底部。 |
| 用户手动往上滚 | 暂停自动滚动 5 秒。 |
| 暂停 5 秒后 | 自动回到底部，继续显示最新执行状态。 |
| 失败发生 | 停留在失败项，直到用户处理或收起。 |
| 待确认发生 | 停留在确认提示，不自动滚过。 |
| 收起态 | 始终显示当前任务两行摘要，不展示完整日志。 |

### 9.6 右下角操作按钮

操作按钮水平排列在抽屉右下角。

```text
┌────────────────────────────────────┐
│ 分镜生成工作流 3/8，队列中 2 个      │
│ 正在生成关键帧 03                    │
│                         [展开][暂停]│
└────────────────────────────────────┘
```

#### 按钮 1：展开/收起

| 状态 | 文案 | 行为 |
|---|---|---|
| 收起态 | 展开 | 原地展开抽屉。 |
| 展开态 | 收起 | 收回到两行状态条。 |
| 有失败项 | 展开 | 展开并定位到失败详情。 |
| 有待确认项 | 展开 | 展开并定位到确认详情。 |

#### 按钮 2：条件按钮

没有确认、执行、暂停、失败等需求时隐藏。

| 场景 | 文案 | 行为 |
|---|---|---|
| Plan 模式计划待确认 | 确认计划 | 确认整个计划并开始执行。 |
| 普通高风险步骤待确认 | 确认 | 直接确认当前最近的待确认项。 |
| 视频生成待授权 | 授权视频 | 直接授权当前最近的视频生成项，文案必须明确写“授权视频”。 |
| 执行中 | 暂停 | 暂停当前任务；已发起 action 按 action 类型处理。 |
| 已暂停 | 继续 | 继续当前任务。 |
| 失败且可重试 | 重试 | 重试当前最近失败项。 |
| 无操作需求 | 隐藏 | 不显示第二按钮。 |

当前真实代码边界：

- `drawerActionLabel()` 已能按状态显示 `授权视频/确认/暂停/继续/重试`。
- `暂停/继续` 已调用 `resolvedExecutionOrchestrator.pause()/resume()`。
- 非视频 v2 execution 的 `确认` 已调用 `resolvedExecutionOrchestrator.run(execution.id, { agentMode, videoAuthorized })`；没有 v2 actions 或没有 Orchestrator 时仍降级旧 `handleConfirmCard()`。
- v2 execution 的 `授权视频` 已在显式 `state.approveVideoGeneration()` 后调用 `resolvedExecutionOrchestrator.run(execution.id, { agentMode, videoAuthorized:true })`；没有 v2 actions 或没有 Orchestrator 时仍降级旧 `handleApply()`。
- `重试` 已调用 `resolvedExecutionOrchestrator.retry(execution.id, { agentMode, videoAuthorized })`；当前同时支持 failed execution cursor-level retry，以及 Slice 154 的 selected-event `actionId` 定位 retry。Slice 151 已确认：如果 retry cursor 指向 `ai-video` 生成且未显式授权，Orchestrator 会停在 `waiting_video_authorization`，不调用 validate/execute；Slice 158 已确认：展开态选中未授权视频 timeline event 时会显示“授权视频”，点击后以 `actionId/eventId` 和 `videoAuthorized:true` 重试该 action。仍缺完整依赖重编译/结果合并和后端执行链路授权 parity。
- `跳过此步` 已在 Slice 155 接入 selected-event 最小闭环：详情区会在 `canRetry=true` 且有 `actionId` 时显示按钮，并调用 `resolvedExecutionOrchestrator.skip(execution.id, { actionId, eventId })`。
- 右下角第二按钮当前只作用于 `visibleExecutionForDrawer()` 返回的当前可见 execution；展开态点击队列卡片只是切换详情查看，不会改变活跃 execution，也不会把条件按钮指向被查看的排队任务。
- `appAssistantPanel.js` 当前没有关闭完成总结按钮；`assistantExecutionStore.updateStatus(... drawerState.visible=false ...)` 支持隐藏，但项目级历史入口尚未提供。

### 9.7 确认规则

| 场景 | 规则 |
|---|---|
| 默认抽屉有待确认 | 第二按钮显示“确认”或“授权视频”。 |
| 点击确认 | 直接确认当前最近的待确认项。 |
| 多个待确认项 | 一次只确认当前最近一项，不批量确认。 |
| 视频确认 | 可在默认抽屉一键授权，但按钮必须写“授权视频”。 |
| 完整确认详情 | 展开态显示完整确认详情，默认抽屉只提示“有 1 项待确认”。 |

确认防护：

- 目标态：`授权视频` 按钮只能授权当前 timeline 中最近的一个 `waiting_video_authorization` action。
- 如果用户切换到另一个排队任务查看详情，默认抽屉的条件按钮仍作用于当前正在执行或最近阻塞的任务，不作用于被查看的排队任务，除非用户在展开态明确点击该排队任务内的确认按钮。
- `确认` 与 `授权视频` 必须是不同文案；视频场景不允许只显示“确认”。

当前真实代码差异：

- 抽屉视频文案安全已完成：待确认/草稿状态如旧 `pendingActions` 中存在未授权真实视频生成，按钮显示“授权视频”。
- v2 execution 的 `actionsByStep` 中存在未授权真实视频生成时，也会显示“授权视频”，不会通过普通“确认”进入 Orchestrator。
- v2 execution 点击“授权视频”后已调用 Orchestrator 并传入 `videoAuthorized:true`；旧 `pendingActions` 或缺少 Orchestrator 时才保留 preview/apply 兼容降级。
- 默认抽屉的 v2 `授权视频` 仍是 execution-level 授权入口；展开态 selected video timeline event 已能按 `actionId/eventId` 走“授权视频”并只重试该 action，但当前实现仍通过 `state.approveVideoGeneration()` + `videoAuthorized:true` 参数表达授权，不是完整的多视频 action 授权 ledger。后续需要把授权语义持久化到后端执行链路，并避免跨 action/跨重试误用。

### 9.8 展开态布局

展开态由三部分组成：

```text
┌────────────────────────────────────────────┐
│ 顶部：任务队列横条                          │
│ [当前任务] [排队 #1] [排队 #2] [暂停任务]    │
├──────────────────────┬─────────────────────┤
│ 左侧：计划区           │ 右侧：时间线/详情     │
│ - 步骤列表            │ - 默认显示时间线      │
│ - 启用/禁用           │ - 点击记录切到详情    │
│ - 排序                │ - 聚焦/重试/撤销      │
└──────────────────────┴─────────────────────┘
```

### 9.9 顶部任务队列横条

展开态显示多个任务队列。默认抽屉只显示当前任务和队列数量，完整队列只在展开态展示。

每个任务卡显示：

- 任务标题。
- 状态。
- 进度。
- 队列序号。
- 取消按钮。
- 置顶按钮。
- 暂停按钮。

交互规则：

| 操作 | 行为 |
|---|---|
| 点击当前任务 | 主区域显示当前任务计划/时间线。 |
| 点击排队任务 | 主区域切换到该任务的计划/时间线，但不改变执行顺序。 |
| 置顶排队任务 | 移动到队列第一位，但不打断当前正在执行的任务。 |
| 暂停当前任务 | 当前任务停止推进。 |
| 暂停排队任务 | 排队任务变成暂停排队，不进入执行。 |
| 取消任务 | 必须明确作用对象：展开态队列卡可取消排队任务；自然语言明确表达“取消当前任务”“取消第一个/最后一个/上一个排队任务”“取消全部排队任务”等会直接执行；缺少对象的“取消任务/取消全部任务”进入本地歧义确认，确认前不改变状态。 |

当前真实代码边界：

- `assistantExecutionStore.enqueueExecution()` 能保存 queued execution，`snapshot().queue` 能按 `queueIndex` 返回队列。
- 展开态 `renderExecutionQueueStrip()` 已能显示当前任务和 queued 任务卡，点击 queued 卡只切换详情查看，并不会改变 `activeExecutionId` 或 queue 顺序；Slice 164 后 queued 卡还提供“置顶/暂停/继续/取消”按钮。
- Slice 162 后，发送新消息得到 v2 execution response 时，如果已有 active execution 且新 execution id 不同，会进入 `enqueueExecution()`；当前 active execution 成功完成后，Orchestrator 会自动执行队列第一项。
- 置顶、取消、暂停/继续排队任务按钮已有前端本地最小实现；当前任务成功完成后自动拉起首个非暂停 queued 任务已有最小实现；Slice 163 已完成 queue warning 最小提示；Slice 164 后自动调度会跳过暂停排队任务。
- 队列调度已完成最小同步闭环：后端状态同步已完成（`queuePaused`、`queue-control` route/client、queued/queued_draft 顺序持久化/查询），Orchestrator 已完成注入式 `prepareQueuedExecution` 成功路径和失败 fail-closed，默认 app 已在存在 `api.prepareQueuedExecution` 时自动调用 `buildContext({ graphStore })` 并进入显式 prepare API boundary；Slice 175 后执行中新 v2 response 默认保存为 `queued_draft`，轮到执行前必须 prepare 且必须返回 fresh actions 才会晋级执行；Slice 177 后 mixed queue 置顶排序已修复。但真实 8777 live 联调、自然语言控制完整语义版、队列失败/视频授权/依赖恢复策略仍未完成。

### 9.10 新任务排队规则

执行中用户继续输入新内容时，系统不判断是否是补充当前任务，全部作为新任务排队。

| 场景 | 规则 |
|---|---|
| 当前有任务执行 | 新输入进入队列。 |
| 队列 <= 5 | 正常加入队列。 |
| 队列 > 5 | 仍允许加入队列，只显示“队列较长”提示。 |
| 用户想取消任务 | 展开态取消，或使用明确自然语言“取消当前任务 / 取消第一个排队任务 / 取消上一个排队任务 / 取消全部排队任务”；“取消任务/暂停任务/继续任务”不直接执行，当前进入本地澄清；用户可用 `当前任务/排队任务` 短回答或点击澄清卡片按钮继续执行，latest-message 待澄清上下文可随会话历史恢复。 |
| 同一时间执行 | 同一时间只执行一个任务；其它任务排队或暂停排队。 |

队列软背压：

- 文本和图片生成不设硬数量限制，但 Project Execution Store 必须限制详细 timeline 的长期保存体积。
- 队列超过 5 个时仍允许加入；当前已按目标态的最小版本保存为 `queued_draft`，轮到执行前再读取最新画布并编译 actions。Slice 169-180 已完成 Orchestrator 注入式 prepare hook、prepare 失败 fail-closed、默认 app latest context + 显式 prepare API boundary、主浏览器 API prepare 暴露、后端 `/prepare` thin boundary、默认 server prepare runner、`queued_draft` 必须拿 fresh actions 才晋级执行，以及前后端 storage 重载安全暂停的离线最小闭环；但真实 8777 live 联调、完整依赖结果合并和完整跨重启冲突策略仍未验收。
- 队列超过 10 个时，默认抽屉只显示当前任务、队列数量和最近一个排队任务；完整列表只在展开态显示。
- 已完成任务的详细 developer 日志可以压缩，普通人话 timeline 和完成摘要必须保留。

当前真实代码边界：

- Slice 162 已实现 v2 execution response 的最小排队：有 active execution 时，新 v2 execution 会进入 `enqueueExecution()`，不抢占当前抽屉。
- Slice 162 已实现当前 execution 成功完成后自动拉起 queued 任务的最小调度；Slice 164 后实际会跳过 `drawerState.queuePaused=true` 的 queued 任务，拉起首个非暂停任务。
- `drawerState.queueWarning` 字段已存在于前端 store sanitizer；Slice 163 已在 v2 response 入队时自动设置，并在展开态队列横条展示“队列较长”。
- Slice 164 已实现前端本地取消/置顶/暂停/继续排队控制，并让 Orchestrator 自动拉起下一项时跳过暂停排队任务。
- Slice 166 已实现 queued 控制后端同步：后端保留 `queuePaused`，提供 `/queue-control`，前端 `controlQueuedExecution()` 进行 best-effort 同步。
- 当前真实代码已有 `queued_draft` 状态；执行中收到的新 v2 response 会以 `queued_draft` 保存，轮到执行前必须 prepare，且必须返回 fresh `actionsByStep` 后才会晋级为 `queued` 并执行。
- 当前 `runNextQueuedExecution()` 轮到队列任务时，如果构造时注入了 `prepareQueuedExecution`，会先调用 hook 并执行 hook 返回的刷新后 actions；如果 hook 抛错，会 fail-closed 为 failed execution 并写 `prepare_failed`，不会执行 stale actions。默认 `appAssistantPanel.js` 已在 `api.prepareQueuedExecution` 存在时注入该 hook，并在 queued 自动执行前重新调用 `buildContext({ graphStore })`、合并引用/附件/@ 提及后请求显式 prepare API boundary。
- 自然语言队列/当前任务控制的本地最小闭环已由 Slice 182/183/185/186/188/189/190/192/193/194/195/196/197/198/199/200/201/202/203/205/206/207/208/209/211/212/213/214/216/218/219 推进：`sendMessage()` 会在模型配置 guard、`api.chat/chatStream` 要求和 LLM 调用前识别单项队列取消/置顶/暂停/继续、`取消全部排队任务`、指定 source/target 序数队列移动、完整序数列表全量重排、两项交换、两类受控三项局部重排、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词歧义本地澄清、标题歧义候选短回答/按钮执行、生成类型语义引用、prompt/content 内容语义引用、资产字段级语义引用、最近一次明确命中任务的代词指代、同一本地 conversation restore 后 recent reference 恢复、最近引用前/后相邻项指代、`它旁边那个` 左右歧义澄清、澄清后 `前面的/后面的` relation 短答执行、同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动、同一本地 conversation restore 后最近两个引用重建，以及同一本地会话最近三个明确队列控制对象的 `刚才那三个` 成组移动；同时覆盖 `暂停当前任务`、`继续当前任务`、`取消当前任务`，以及 `取消任务/暂停任务/继续任务` 这类 broad 命令的首轮澄清、下一条 `当前任务/排队任务` 短回答执行和澄清按钮点击执行、澄清卡片完成/禁用态、latest-message 澄清上下文历史恢复、completed card 本地持久回写和新澄清到来时归档旧未决卡片；命中直接执行的队列命令会复用 `assistantExecutionStore`、`assistantExecutionOrchestrator` 和后端 `queue-control` best-effort 同步；命中标题/类型/内容/资产/最近旁边歧义澄清的命令只返回 `clarify/needs_clarification` 与候选数据，不移动队列、不调用后端同步，选中候选后才移动并同步；这些本地控制都不调用 LLM、不误改非目标状态。

### 9.11 计划编辑规则

计划编辑只在展开态左侧计划区进行，默认抽屉不提供编辑。

| 模式 | 编辑规则 |
|---|---|
| Plan 模式 | 确认前可编辑计划。 |
| Act 模式执行中 | 必须先暂停，才能编辑未执行步骤。 |
| 已执行步骤 | 第一版不允许编辑。 |
| 执行中步骤 | 第一版不允许编辑。 |
| 未执行步骤 | 暂停后可启用/禁用、调整顺序。 |

第一版允许编辑：

- 启用/禁用步骤。
- 调整步骤顺序。
- 单独执行某一步。

第一版不允许：

- 修改 prompt 具体内容。
- 直接编辑连线。
- 拖动 mini canvas。
- 改节点类型和生成参数。

### 9.12 时间线与详情

右侧区域默认显示时间线。点击某条记录后，右侧时间线区域切换成详情。

普通用户详情显示：

- 人话说明：做了什么。
- 对象：节点、资产、边或任务。
- 状态：成功、失败、暂停、待确认等。
- 影响范围：例如“后续 3 步依赖这一步”。
- 可操作按钮：聚焦、重试、跳过；只有 `canUndo=true` 时才显示可点击“撤销到这里”。

开发者模式额外显示：

- action JSON。
- schema 校验结果。
- executor 结果。
- 错误堆栈。
- canvas diff。

人话映射要求：

- 普通用户时间线不得直接显示 `create_node`、`layout_nodes`、`queue_generation_task` 等技术 action 名。
- 旧 `assistantActionPreviewModel` 中的英文标题、action type、subtitle 只能进入开发者模式或调试详情。
- 普通用户文案必须由 `humanText`、skill 中文名称、节点显示名和执行结果组成。
- 预设提示词场景只显示“已使用某某预设生成”，不得展示完整模板内容。

当前真实代码边界：

- 展开态详情当前有一段 `timelineEventDetailText()` 文本、“聚焦对象”按钮，以及 selected-event `canRetry=true` 且有 `actionId` 时的“重试此步/跳过此步”按钮；Slice 158 后，未授权视频 selected event 会隐藏普通 retry/skip 并显示“授权视频”；Slice 160 后，失败/跳过源事件详情会显示“后续 N 步依赖这一步”。
- 详情区尚未渲染 undo 按钮，也没有开发者模式 JSON 面板；selected video event “授权视频”只是最小 action retry 授权入口，不等于完整视频授权 ledger。
- Slice 152 后，Orchestrator 已把常见技术 action 的 `humanSummary` 转成中文摘要，避免普通 timeline 直接出现 `Running:/Completed:/Failed:` 或 `queue_generation_task`。
- Timeline Humanizer 仍需要继续扩展词库、错误详情中文化和开发者模式 JSON 面板；不能把当前最小切片视为最终人话验收。

### 9.13 完成总结

任务完成后，抽屉保留最近一次任务总结；下一次任务开始时自动替换。

用户可以手动关闭完成总结。关闭后：

- 当前聊天历史里保留摘要。
- 项目级 AI 执行历史里保留完整计划和时间线。
- 输入框上方抽屉隐藏，直到下一次有计划或执行记录。

当前真实代码边界：

- `assistantExecutionStore.updateStatus(id, status, { drawerState: { visible:false } })` 和后端 `update_status()` 能保存隐藏状态。
- `visibleExecutionForDrawer()` 已按 `drawerState.visible` 决定是否显示抽屉。
- 但 `appAssistantPanel.js` 还没有“关闭完成总结”按钮，也没有关闭后打开项目级 AI 执行历史的完整入口；目前只有面板 init 时把后端 execution 历史导入本地 store/抽屉的最小能力。

## 10. 计划与任务状态机

### 10.1 计划步骤状态机

计划步骤采用完整状态机：

```text
草稿
  │
  v
待确认 ──> 跳过
  │
  v
已确认
  │
  v
排队
  │
  v
执行中
  │
  ├──> 成功
  │
  ├──> 失败 ──> 已重试 ──> 执行中
  │       │
  │       ├──> 跳过
  │       └──> 已撤销
  │
  └──> 已撤销
```

Plan 模式：

```text
草稿 -> 待确认 -> 用户确认 -> 已确认 -> 排队 -> 执行中 -> 成功/失败
```

Act 模式：

```text
草稿 -> 已确认 -> 排队 -> 执行中 -> 成功/失败
```

如果遇到视频生成：

```text
执行中 -> 待确认 -> 用户点击“授权视频” -> 排队 -> 执行中
```

### 10.2 任务队列状态机

```text
新任务
  │
  ├─ 当前无执行任务 -> 当前任务 -> 执行中
  │
  └─ 当前有执行任务 -> 排队
                         │
                         ├─ 置顶 -> 排到队列第一位，不打断当前任务
                         ├─ 暂停 -> 暂停排队
                         ├─ 取消 -> 已取消
                         └─ 轮到执行 -> 当前任务 -> 执行中
```

当前真实代码状态机边界：

- 前端状态枚举已有 `queued_draft`；排队任务可以是 `queued` 或 `queued_draft`，暂停排队通过 `drawerState.queuePaused=true` 表达。
- `cancelQueuedExecution()` / 后端 `control_queued_execution(..., "cancel")` 会把 queued 任务改为 `cancelled` 并清空 `queueIndex`。
- `top` 只调整 queued 任务 `queueIndex`，不会打断当前 active execution。
- “轮到执行 -> 重新读取最新画布 -> 重编译 actions -> 执行中”已有最小代码闭环：当前 Orchestrator 支持注入式 prepare hook、prepare 失败 fail-closed，并能执行刷新后的 `plan/actionsByStep`；默认 app 在显式 `api.prepareQueuedExecution` 存在时已注入 latest context API boundary；主 `createCanvasAgentApi()` 已暴露该方法，Slice 174 已接入默认 server prepare runner，Slice 175 已要求 `queued_draft` 必须拿 fresh actions 才执行；真实 8777 live 联调仍未完成。

### 10.3 暂停规则

| 对象 | 暂停行为 |
|---|---|
| 当前任务 | 停止推进后续 action。 |
| 已发起 action | 根据 action 类型处理；默认不强杀上游生成任务，只暂停后续队列。 |
| 排队任务 | 变成暂停排队，不进入执行。 |
| 生成类动作 | 默认不强杀上游生成任务。 |
| 普通画布操作 | 未开始的操作暂停；已执行完成的操作不回滚。 |

## 11. Undo / Replay

### 11.1 Undo 范围

用户可以撤销到某个时间线步骤。撤销策略：

- 只撤销 AI 自己创建或修改的内容。
- 尽量保留用户后续手动修改。
- 撤销画布结构时，保留已生成图文资产在资产库。
- 如果遇到冲突，优先保护用户手动修改。

### 11.2 撤销数据要求

每个 action 应记录：

```json
{
  "actionId": "action_001",
  "forward": {
    "type": "create_node",
    "payload": {}
  },
  "inverse": {
    "type": "remove_ai_created_node",
    "payload": {
      "nodeId": "node_001",
      "preserveGeneratedAssets": true
    }
  },
  "ownership": {
    "createdBy": "assistant",
    "userModifiedAfterAction": false
  }
}
```

当前真实代码只具备局部 prompt surgery `undoPatch` 记录，不具备通用画布 inverse patch。实现时必须按 action 类型逐步补齐：

| action 类型 | inverse 要求 | 第一版 UI |
|---|---|---|
| `create_node` | 记录创建的 node id、节点快照、AI ownership。 | inverse 存在时可撤销；否则禁用。 |
| `connect_nodes` | 记录创建的 edge id、端口、AI ownership。 | inverse 存在时可撤销；否则禁用。 |
| `update_node_data` / `rename_node` | 记录修改前字段快照和用户后续修改检测。 | prompt surgery 已有局部基础，其它字段需补齐。 |
| `layout_nodes` / `move_nodes` | 记录每个节点修改前后的 x/y/width/height。 | 可撤销布局，但不得覆盖用户后续拖动。 |
| `queue_generation_task` / `run_prompt_preset_generation` | 默认不删除生成资产，只撤销节点状态或生成任务引用。 | 默认显示“保留资产，仅撤销画布引用”。 |
| `video generation` | 未授权不执行；已授权执行后撤销不删除远端计费结果。 | 需要单独提示。 |

UI gating：

- 没有 `inverse` 或 `canUndo=false` 的 timeline 记录，不显示可点击“撤销到这里”，只显示灰色“不可撤销”或不显示入口。
- Phase 2/3 如果还没有 inverse 数据，只能展示时间线和重试，不能承诺可撤销。
- 缺 inverse 的 timeline 步骤不显示可点击撤销；Phase 4 才允许把“撤销到这里”作为可用验收项。

### 11.3 冲突处理

| 冲突 | 处理 |
|---|---|
| 用户改过 AI 创建的节点 | 默认保留用户修改，不删除该节点，提示“已保留用户修改”。 |
| 用户移动过 AI 创建节点 | 不强制恢复位置，除非用户选择完整回滚。 |
| 用户手动连接了 AI 节点 | 不删除用户手动连线。 |
| AI 生成资产被其它节点引用 | 撤销原节点，但资产保留。 |
| 依赖节点已不存在 | 该撤销 action 标记为跳过并记录原因。 |

### 11.4 Replay 规则

| 动作类型 | 默认 Replay 行为 |
|---|---|
| 创建节点 | 可以重放。 |
| 连线 | 可以重放。 |
| 移动/布局 | 可以重放。 |
| 文本生成 | 默认不重新生成，用户可点击重新生成此步。 |
| 图片生成 | 默认不重新生成，用户可点击重新生成此步。 |
| 视频生成 | 必须重新授权。 |
| 资产绑定 | 可以重放，资产不存在时提示用户。 |

## 12. 执行失败处理

采用依赖关系处理策略：

```text
某 action 失败
  │
  ├─ 无后续依赖
  │    └─ 标记失败，继续执行其它无关步骤
  │
  ├─ 有后续依赖
  │    └─ 暂停依赖它的步骤
  │
  ├─ 可重试
  │    └─ 默认抽屉显示失败摘要，展开详情可重试
  │
  ├─ 可跳过
  │    └─ 展开详情提供跳过按钮
  │
  └─ 可回滚
       └─ 展开详情提供撤销到失败前
```

失败展示规则：

| 位置 | 内容 |
|---|---|
| 收起态抽屉 | 两行摘要：任务进度 + 最新失败状态。 |
| 条件按钮 | 如果最近失败项可重试，显示“重试”。 |
| 展开态右侧详情 | 显示失败原因、影响范围、重试、跳过、撤销到这里、开发者详情。 |
| 时间线 | 失败项停留，不自动滚过。 |

失败卡片示例：

```text
第 5 步失败：生成关键帧 02
原因：上游模型超时
影响：后续 3 个视频草稿依赖该图片，已暂停
可操作：重试 / 跳过 / 撤销到这里 / 查看详情
```

当前真实代码边界：

- `assistantExecutionOrchestrator.js` 已在 validate/execute 失败时写入 failed event；如果当前 plan 存在 `dependsOn`，会把失败 step 记入 dependency map，继续执行无依赖后续 action，并将依赖失败 step 的后续 action 写成 `dependency_blocked`。
- `skip(executionId, { actionId, eventId })` 已能把 selected action 写成 `skipped` event；如果跳过的是上游 step，也会把依赖它的后续 action 写成 `dependency_blocked` 并暂停在第一个阻塞 cursor。
- `appAssistantPanel.js` 已能在源失败/跳过事件详情中显示“后续 N 步依赖这一步”，并列出被阻塞步骤名。
- 当前失败恢复仍是最小闭环：没有下游 action 重编译、没有重试/跳过后的结果合并、没有 action 输出级依赖、没有跨重启后的依赖冲突处理，也没有 Undo inverse patch。
- 因此失败详情里的“撤销到这里”仍是 Phase 4 目标态；在 inverse patch 落地前 UI 应隐藏或禁用，而不是只显示按钮。

## 13. 数据持久化

### 13.1 保存策略

| 数据 | 保存位置 |
|---|---|
| 聊天消息 | 会话级 conversation store。 |
| 当前计划草稿 | 会话级 + 项目临时状态。 |
| 已执行计划 | 项目级 execution store。 |
| 任务队列 | 项目级 execution queue，保存当前任务、排队任务、暂停任务。 |
| 时间线 | 项目级 operation timeline。 |
| action debug | 项目级开发者日志，可限制大小。 |
| 生成资产 | 资产库，撤销时默认保留。 |
| 完成总结 | 当前聊天历史保留摘要，项目级 AI 执行历史保留完整记录。 |

### 13.2 Project Execution Store

```json
{
  "projectId": "project_001",
  "activeExecutionId": "exec_001",
  "queue": [
    {
      "id": "exec_002",
      "title": "排队任务 1",
      "status": "queued",
      "queueIndex": 1,
      "progress": { "done": 0, "total": 6 }
    }
  ],
  "executions": [
    {
      "id": "exec_001",
      "conversationId": "conv_001",
      "intentId": "intent_001",
      "planId": "plan_001",
      "title": "6 镜头故事分镜与关键帧生成",
      "status": "executing",
      "drawerState": {
        "visible": true,
        "expanded": false,
        "line1": "分镜生成工作流 3/8，队列中 2 个",
        "line2": "正在生成关键帧 03",
        "queueWarning": false,
        "queuePaused": false,
        "pendingConfirmationCount": 0
      },
      "createdAt": "2026-06-09T12:00:00+08:00",
      "updatedAt": "2026-06-09T12:05:00+08:00",
      "orchestratorState": {
        "nextActionIndex": 3,
        "pausedAtActionId": "",
        "running": true
      },
      "timeline": [
        {
          "id": "evt_001",
          "stepId": "step_keyframes",
          "actionId": "action_keyframe_03",
          "status": "completed",
          "humanSummary": "已生成关键帧 03",
          "nodeIds": ["keyframe_03"],
          "canRetry": true,
          "canUndo": false,
          "developer": {}
        }
      ]
    }
  ]
}
```

实现归属：

| 层 | 模块建议 | 当前状态 | 要求 |
|---|---|---|---|
| 前端 store | `modules/assistant/assistantExecutionStore.js` | 已完成最小闭环 | 独立于 `assistantConversationStore`，保存项目级 queue、executions、timeline、drawerState；已支持 `snapshot/list/getExecution/createExecution/enqueueExecution/updateStatus/appendTimelineEvent/clearCompleted`。 |
| 后端 service | `services/canvas_agent_execution_service.py` | 已完成 timeline/orchestrator 扩展字段持久化与队列控制同步最小闭环 | 独立于 `canvas_agent_conversation_service.py`，提供项目级执行历史读写；支持脱敏、每项目 `max_executions` 裁剪、timeline append、status update、clear completed；Slice 149 后已持久化 timeline `nodeIds/error/canRetry/canUndo/durationMs/developer` 和 execution `orchestratorState`；Slice 166 后已持久化 `drawerState.queuePaused`，并支持 queued 任务 `top/pause/resume/cancel` 后端控制与按 `queueIndex` 查询。 |
| API route | `/api/v2/canvas-agent/executions/*` | 已完成基础与队列控制最小闭环 | 支持 list/get/upsert/append-event/update-status/clear-completed，以及 `PATCH /api/v2/canvas-agent/executions/{id}/queue-control`；`services/http_route_dispatcher.py` path allowlist 已覆盖 executions 子路由。后续新增 execution 子能力仍走该 namespace，不要新增 `/api/v2/assistant/executions/*`。 |
| 本地 key | `huanying.canvasAgent.executions.v1` | 已在前端 store 使用 | 前端离线可用；后端可同步时再写服务端。 |
| 迁移 | `transactions -> executions` 只做只读兼容 | 未完成 | 旧 conversation transactions 可显示为历史摘要，但不能假装具备 step timeline。 |

存储保留策略：

- 每个项目默认保留最近 50 个 execution 的完整人话 timeline。
- developer action JSON、schema result、error stack 只保留最近 20 个 execution 或按大小压缩。
- 队列中的 `queued_draft` 已按最小状态机在轮到执行前重新读取最新画布上下文再编译 actions：前端默认 app 会传 latest context，后端 prepare route/runner 已接线，Orchestrator 和后端 service 都要求 fresh `actionsByStep` 才能晋级执行。
- API key、完整 prompt preset 模板、本地绝对路径不得写入 execution store。
- 完成总结关闭后，drawerState 可隐藏，但 execution 记录不能删除。

已落地的后端扩展字段持久化（Slice 149）：

- `orchestratorState.nextActionIndex/pausedAtActionId/running` 已由 `CanvasAgentExecutionService._sanitize_orchestrator_state()` 持久化，且非 executing 状态不会保留 `running=true`。
- timeline 的 `nodeIds/affectedNodeIds/createdNodeIds/updatedNodeIds/queuedGenerationNodeIds/startedGenerationNodeIds` 已被合并去重为 `nodeIds`。
- timeline `error/canRetry/canUndo/durationMs/developer` 已保留并继续脱敏。
- 后端导入到前端 store 后，详情“聚焦对象”、重试、撤销 gating 和 pause cursor 的基础依据不会因后端历史加载丢失。

仍缺的持久化/历史能力：

- Undo inverse patch、AI ownership、用户后续修改冲突状态尚未持久化。
- Replay 元数据、重放策略、视频 replay 授权状态尚未持久化。
- 完整历史浏览入口所需的分页、筛选、搜索、关闭总结后的找回 UX 尚未实现。
- 队列调度状态已具备“完成后自动拉起下一项”“超过 5 个提示但继续排队”“暂停/继续/取消/置顶”“后端 queue-control 同步”和“轮到执行前 prepare/recompile”的最小闭环；但失败/视频/依赖联动、自然语言控制完整语义版、跨重启冲突恢复和真实 8777 live 联调尚未形成完整状态机。

当前前端 store 已实现的安全裁剪：

- `apiKey/accessToken/authorization/secret/password/credential/headers/cookie` 等字段会从 developer payload 中移除。
- `localPath/filePath/filesystemPath/absolutePath` 和疑似本地绝对路径字符串会被移除或置空。
- 长 base64 data URL 和 `Bearer ...`、`sk-...` 样式 token 会被脱敏。
- `maxExecutions` 会保留活跃任务，并按更新时间保留最近完成/取消任务；默认目标仍是每项目 50 条。

### 13.3 AI 执行历史

用户关闭完成总结后，仍可从两处找回：

1. 当前聊天历史：保留简短摘要和入口。
2. 项目级 AI 执行历史：保留完整计划、任务队列、时间线、详情、开发者日志。

当前真实代码只完成“面板初始化时从后端导入同项目 execution 并刷新当前抽屉”的最小闭环；还没有独立的历史浏览入口、搜索、筛选、分页，也没有关闭完成总结后的完整找回交互。

## 14. UI 详细设计

### 14.1 页面层级

```text
右侧智能体区域
  │
  ├─ 聊天消息区
  │   ├─ 用户消息
  │   ├─ 助手回复
  │   └─ 历史消息
  │
  ├─ 输入框上方执行抽屉
  │   ├─ 收起态两行状态
  │   ├─ 展开态任务队列横条
  │   ├─ 展开态左侧计划区
  │   ├─ 展开态右侧时间线/详情区
  │   ├─ 失败摘要
  │   ├─ 确认摘要
  │   └─ 完成总结
  │
  ├─ 抽屉右下角操作按钮
  │   ├─ 展开 / 收起
  │   └─ 条件按钮：确认 / 授权视频 / 暂停 / 继续 / 重试
  │
  └─ 输入框
      ├─ 文本输入
      ├─ / 快捷调用
      ├─ @ 添加上下文
      ├─ 附件
      └─ 发送按钮
```

### 14.2 布局变化

```text
无任务：
┌──────────────────────────────┐
│ 聊天内容                      │
├──────────────────────────────┤
│ 输入框                        │
└──────────────────────────────┘

有任务收起态：
┌──────────────────────────────┐
│ 聊天内容                      │
├──────────────────────────────┤
│ 分镜生成工作流 3/8，队列中 2 个 │
│ 正在生成关键帧 03      [展开][暂停]
├──────────────────────────────┤
│ 输入框                        │
└──────────────────────────────┘

展开态：
┌──────────────────────────────┐
│ 聊天内容被轻微渐变/模糊覆盖     │
│ ┌──────────────────────────┐ │
│ │ 任务队列横条              │ │
│ ├───────────┬──────────────┤ │
│ │ 计划区     │ 时间线/详情区   │ │
│ └───────────┴──────────────┘ │
├──────────────────────────────┤
│ 输入框仍可输入，新需求进入队列  │
└──────────────────────────────┘
```

### 14.3 默认抽屉文案结构

| 行 | 内容 |
|---|---|
| 第一行 | 任务名 + 进度 + 队列数量。 |
| 第二行 | 最新状态。 |

示例：

```text
故事分镜生成 3/8，队列中 2 个
正在连接「分镜 03」到「关键帧 03」
```

文案要求：

- 普通用户默认只看人话，不显示 `create_node`、`layout_nodes` 等技术 action 名。
- 视频确认按钮必须写“授权视频”。
- 队列超过 5 个时显示“队列较长”。
- 失败摘要要说明影响范围，例如“后续 3 步已暂停”。

### 14.4 展开态任务队列横条

每个任务卡包含：

| 字段 | 说明 |
|---|---|
| 标题 | 任务简短名称。 |
| 状态 | 执行中、排队、暂停、失败、完成。 |
| 进度 | 例如 3/8。 |
| 队列序号 | 例如 #1、#2。 |
| 取消 | 取消该任务。 |
| 置顶 | 移到队列第一位，不打断当前任务。 |
| 暂停 | 当前任务停止推进；排队任务变成暂停排队。 |

当前真实 UI：任务队列横条已显示任务标题/状态，支持点击切换展开态查看；Slice 164 后 queued 卡已提供“置顶/暂停/继续/取消”前端本地最小控制；Slice 166 后这些控制会 best-effort 同步后端 `queue-control` route / API client，并能通过后端保存 `queuePaused`；Slice 169-180 后轮到执行前 prepare/recompile 已有离线最小闭环，Slice 177 后 mixed queue 置顶排序已修复，Slice 196-209/211/212/213/214/216/218/219/221 后自然语言指定位置移动、完整序数列表全量重排、两项交换、两类受控三项句式、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词歧义本地澄清、标题歧义候选短回答/按钮执行、生成类型语义引用首片、prompt/content 内容语义引用首片、资产字段级语义引用首片、最近一次命中任务代词指代和同一本地 conversation restore 后最近引用恢复、最近引用前/后相邻项指代、`它旁边那个` 左右歧义澄清、澄清后前/后短答执行、同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动、同一本地 conversation restore 后最近两个引用重建已完成前端最小闭环，其中 move/reorder 会做前端/后端最小同步，歧义澄清本身不会改队列也不会调用后端同步，选中候选后才会移动并同步。仍缺自然语言复杂语义（连续多次相邻跳转、无明确数量的“刚才那几个/那一组”多对象、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、复杂歧义选择）、跨设备/后端消息同步、真实 8777 live 联调和失败/视频/依赖联动策略。

### 14.5 左侧计划区

只在展开态显示。用于计划编辑和计划查看。

| 功能 | 规则 |
|---|---|
| 查看步骤 | 显示步骤标题、状态、依赖、是否启用。 |
| 启用/禁用 | Plan 模式确认前可直接操作；Act 模式必须暂停后操作未执行步骤。 |
| 调整顺序 | 只允许调整未执行步骤。 |
| 单步执行 | 支持对未执行步骤单独执行。 |
| 已执行步骤 | 第一版不可编辑。 |

当前真实 UI：任务队列横条已显示任务标题/状态，支持点击切换展开态查看；Slice 164 后 queued 卡已提供“置顶/暂停/继续/取消”前端本地最小控制；Slice 166 后这些控制会 best-effort 同步后端 `queue-control` route / API client，并能通过后端保存 `queuePaused`；Slice 169-180 后轮到执行前 prepare/recompile 已有离线最小闭环，Slice 177 后 mixed queue 置顶排序已修复，Slice 196-209/211/212/213/214/216/218/219/221 后自然语言指定位置移动、完整序数列表全量重排、两项交换、两类受控三项句式、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词歧义本地澄清、标题歧义候选短回答/按钮执行、生成类型语义引用首片、prompt/content 内容语义引用首片、资产字段级语义引用首片、最近一次命中任务代词指代和同一本地 conversation restore 后最近引用恢复、最近引用前/后相邻项指代、`它旁边那个` 左右歧义澄清、澄清后前/后短答执行、同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动、同一本地 conversation restore 后最近两个引用重建已完成前端最小闭环，其中 move/reorder 会做前端/后端最小同步，歧义澄清本身不会改队列也不会调用后端同步，选中候选后才会移动并同步。仍缺自然语言复杂语义（连续多次相邻跳转、无明确数量的“刚才那几个/那一组”多对象、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、复杂歧义选择）、跨设备/后端消息同步、真实 8777 live 联调和失败/视频/依赖联动策略。

### 14.6 右侧时间线/详情区

默认显示时间线。点击某条记录后，右侧切换为详情。

时间线字段：

- 人话动作描述。
- 对象。
- 状态。
- 耗时。
- 错误摘要。
- 可撤销标记。
- 重试入口。

详情字段：

- 做了什么。
- 对象是谁。
- 成功/失败原因。
- 影响范围。
- 聚焦、重试、撤销到这里、跳过。
- 开发者模式里的 action JSON、校验结果、错误堆栈。

当前真实 UI 边界：

- `.hy-canvas-agent-execution-event-detail` 已显示 `timelineEventDetailText()` 生成的人话详情。
- 如果 timeline event 或 `developer.actionJson` 能解析出节点 id，详情区会显示“聚焦对象”并调用 `graphStore.setSelectedNodes()`。
- selected event 满足 `canRetry=true` 且有 `actionId` 时，已显示“重试此步”；非视频同类事件还会显示“跳过此步”；未授权视频事件显示“授权视频”。
- 源失败/跳过事件已能显示 `dependency_blocked` 后续依赖摘要。
- 还没有可点击 undo，也没有开发者模式 JSON 面板；“撤销到这里”和完整开发者详情仍是目标态，不应算作已验收。

### 14.7 操作按钮视觉位置

按钮水平排列在抽屉右下角：

```text
[展开] [确认/授权视频/暂停/继续/重试]
```

要求：

- 两个按钮不能挤压输入框。
- 第二按钮无状态需求时隐藏。
- 确认、授权视频、重试等关键按钮要有明确文案，不只用图标。
- 展开按钮可以使用图标 + hover tooltip。

### 14.8 视觉风格

设计方向：专业创作软件 + 轻量微交互。

| 项 | 建议 |
|---|---|
| 字体 | Plus Jakarta Sans 或现有项目字体体系；中文保持当前项目兼容字体。 |
| 主色 | 延续幻映现有视觉，不强行改成新品牌色。 |
| 状态色 | 成功淡绿、执行中蓝青、失败淡红、等待确认橙色。 |
| 卡片 | 弱边框、低对比背景，不使用厚重气泡。 |
| 覆盖层 | 展开态覆盖聊天区时使用轻微渐变/模糊。 |
| 动效 | 抽屉展开 180-240ms，状态切换 120-180ms。 |
| 可访问性 | 按钮有 focus 状态，文字可复制，错误超过三行折叠。 |

## 15. 简化 DAG 预览

目标形态是计划展开后显示不可编辑简化 DAG；当前真实代码尚未实现 DAG 预览，展开态仍是只读步骤列表。

```text
[故事大纲]
    │
    v
[分镜 01] -> [关键帧图 01]
[分镜 02] -> [关键帧图 02]
[分镜 03] -> [关键帧图 03]
    │
    v
[整理画布]
```

DAG 要求：

- 只展示节点、连线、分组。
- 不允许拖拽编辑。
- 节点点击后可在真实画布中聚焦。
- 失败节点用红色弱提示。
- 待确认视频节点用橙色弱提示。

## 16. 安全与权限

| 风险 | 规则 |
|---|---|
| 视频生成 | 必须用户授权。 |
| 删除节点 | 第一版默认不允许 AI 删除用户内容。 |
| 文件系统 | 禁止。 |
| shell 命令 | 禁止。 |
| 外部网络抓取 | 禁止，除非未来单独授权。 |
| API Key | 不进入 skill、plan、timeline 明文。 |
| Prompt preset 完整模板 | 不直接展示给用户，不粘贴到输入框。 |
| 用户手动修改 | Undo 时优先保护。 |

实现安全验收：

- `Act` 模式下如 action 包含 `ai-video` 的 `queue_generation_task` 或 `run_prompt_preset_generation`，未点击“授权视频”前必须停在待授权状态。
- 前端、后端 schema、Execution Orchestrator、Canvas Skills Runtime 都要重复检查视频授权，不能只依赖模型自觉。
- 删除用户内容、文件系统、shell、外部网络抓取第一版无 UI 授权入口，模型输出也必须被 schema 拦截。
- provider key、OpenAI-compatible key、local proxy token 只能存在配置和后端代理层，不进入 Claw prompt、PI prompt、execution store 或 timeline。
- prompt preset 可被 action 使用，但完整模板不进入聊天消息、不进入普通用户 timeline、不被粘贴到输入框。

### 16.1 本地服务协作约束

项目默会规则必须写入开发和联调流程：

- 开发者不要主动启动 `8777` 服务。
- 开发者不要主动检查、探测、停止或重启 `8777` 服务。
- 如果某一步需要真实服务就绪，先停下来告诉用户“需要 8777 服务就绪”，等用户处理并回复后继续。
- 用户明确说“已经启动/重启好了”后，可以做依赖该服务的联调调用，但不要顺手管理服务状态。
- 只有用户明确要求“你来检查 8777”或“你来启动服务”时，才允许执行对应动作。
- 离线测试、静态测试、Node/Python 单元测试不受该规则限制，只要不访问 `http://127.0.0.1:8777`。

## 17. 开发者模式

普通用户默认看到：

```text
已创建 6 个分镜节点
正在生成第 3 张关键帧
第 4 步失败：模型超时，可重试
```

开发者模式可看到：

- matched skills。
- intent JSON。
- plan JSON。
- actions before validate。
- executable actions。
- schema validation result。
- executor result。
- error stack。
- canvas diff。

开发者入口：

- 时间线 action 右侧 `...`。
- 失败卡 `查看详情`。
- 设置中启用 `开发者模式`。

当前真实代码已有 `modules/debugMode.js` 基础模块，但执行抽屉详情尚未接入完整开发者 JSON 面板；目前只在 timeline event 的 `developer` 字段中保存部分调试数据，普通 UI 不展示完整 schema/result/error stack。

## 18. 测试与验收

### 18.1 Skill 离线回归测试

每个 skill 最终必须覆盖。当前 `tools/run_assistant_skill_v2_offline_tests.py` 只完成“命中测试”的最小闭环，下面其余断言仍是后续测试增强要求：

| 测试 | 要求 |
|---|---|
| 命中测试 | 用户输入能匹配正确 skill。 |
| 计划测试 | 输出符合预期 Plan。 |
| action 测试 | actions 在 allowedActions 内。 |
| 禁止项测试 | 不输出 forbiddenActions。 |
| 质量测试 | 满足 qualityRules 的关键断言。 |

### 18.2 真实画布模拟测试

必须有 fixture：

| Fixture | 用途 |
|---|---|
| messy_canvas_basic.json | 测试画布整理。 |
| prompt_preset_text.json | 测试文本预设生成。 |
| prompt_preset_image.json | 测试图片预设生成。 |
| assets_existing_character.json | 测试资产查找和绑定。 |
| storyboard_6_shots.json | 测试故事/分镜工作流。 |
| failed_generation_partial.json | 测试失败恢复。 |
| multi_task_queue_6_items.json | 测试队列超过 5 个后的提示和继续排队。 |
| act_mode_video_requires_authorization.json | 测试 Act 模式不等于视频授权。 |
| legacy_skill_migration.json | 测试旧 `qualityRubric/body/compactBody` 能迁移到 v2。 |
| pi_registry_adapter.json | 测试 PI 使用同一 skill 定义而非只用硬编码 prompt。 |
| execution_store_persistence.json | 测试关闭总结后仍可找回项目级 execution。 |
| undo_gating_without_inverse.json | 测试缺少 inverse 时不显示可点击撤销。 |

### 18.3 UI 验收

| 场景 | 验收标准 |
|---|---|
| 无任务 | 输入框上方抽屉隐藏。 |
| 生成计划 | 输入框上方出现执行抽屉，贴着输入框，不遮挡输入框。 |
| 收起态 | 两行显示：任务名/进度/队列数量，最新状态。 |
| 执行中 | 时间线持续追加，默认自动滚到底部。 |
| 手动查看旧日志 | 暂停自动滚动 5 秒，之后自动回到底部。 |
| 展开 | 原地展开，最高不超过面板 70%，覆盖聊天并带轻微渐变/模糊。 |
| 展开布局 | 顶部任务队列横条，左侧计划，右侧时间线/详情。 |
| 点击外部 | 点击聊天区后抽屉收起到状态条。 |
| 新输入 | 执行中新输入全部作为新任务排队；当前 v2 execution response 主链路已在有 active execution 时进入 `enqueueExecution()`，当前任务成功完成后会自动拉起首个非暂停 queued/queued_draft 任务；超过 5 个排队任务时显示“队列较长”但继续允许入队；展开态 queued 卡已支持取消/置顶/暂停/继续，并在 Slice 166 后 best-effort 同步后端；Slice 169-180 已补轮到执行前 prepare/recompile 和重启安全暂停的离线最小闭环。旧 `actions` 兼容流、自然语言控制完整语义版、完整跨重启冲突策略、失败/视频/依赖联动和真实 8777 live 联调仍需补测试和实现。 |
| 队列超过 5 个 | 仍允许加入，只显示“队列较长”；当前已有 `queueWarning` 字段，且 Slice 163 已在展开态最小展示。 |
| 待确认 | 默认抽屉提示待确认，第二按钮显示确认或授权视频。 |
| 视频确认 | 按钮文案必须是“授权视频”。 |
| 暂停 | 执行中第二按钮显示暂停；暂停后显示继续。 |
| 失败 | 失败卡显示错误、影响、重试、跳过、撤销入口。 |
| 撤销 | Phase 4 前只有 `canUndo=true` 的步骤显示可点击撤销；缺 inverse 时禁用或隐藏。 |
| Replay | 默认不重新生成图片/文本，用户可手动重新生成该步。 |
| 完成总结 | 保留最近一次总结，可手动关闭；关闭后历史可找回。当前真实代码尚未提供关闭按钮和完整历史浏览入口。 |
| 开发者模式 | 可展开 action JSON 和校验详情。 |

### 18.4 真实代码回归验收

| 回归点 | 验收标准 |
|---|---|
| Claw v2 adapter | `ClawBridgeService._build_prompt_payload()` 和真实 chat payload 中能看到 v2 matched skill，且不泄露 API key；若走 HTTP，则优先确认 `/api/v2/assistant/chat` 在当前启动路径已被 dispatcher 暴露。 |
| PI v2 adapter | `huanyingTools` 和真实 `piClient` system prompt 都能读取 v2 allowedActions 和 risk rules；不是只在单独 helper 测试中通过。 |
| Canvas Skills adapter | v2 skill 能映射到文本、图片、视频、资产相关 Canvas Skills id，且底层仍走现有 Canvas Skills runtime。 |
| Batch executor 降级 | 新 Orchestrator 可逐步调用旧 executor；旧 `actions` 合同仍能降级执行。 |
| Project Execution Store | 前端 `assistantExecutionStore` 已有最小单测，UI 已能写入/读取本地 store；后端 `CanvasAgentExecutionService` 和 `/api/v2/canvas-agent/executions/*` route 已有最小回归；前端已能把新 execution 和初始 timeline event 尽力同步后端，并能在面板 init 时从后端加载同项目 execution 历史到 store/抽屉；后端已保留 timeline `nodeIds/error/canRetry/canUndo/durationMs` 与 `orchestratorState`；Orchestrator 已持续写入状态和 timeline，selected-event retry/skip/video authorization 已能按 `actionId` 定位。完整验收还要求关闭总结后可从项目级历史入口找回，并补 Undo/Replay，不依赖旧 conversation transactions 伪造 timeline。 |
| 队列重编译 | 已完成前端运行时、后端薄边界和默认 server runner 最小闭环：注入 `prepareQueuedExecution` 时，queued 任务轮到执行前可刷新 `plan/actionsByStep`、写入 `prepared` timeline，并执行刷新后的 action；prepare 抛错时会写 `prepare_failed`、标记 failed、显示错误且不执行旧 actions；默认 app 在显式 `api.prepareQueuedExecution` 存在时会读取 latest `buildContext({ graphStore })` 并调用该 boundary；Slice 172 后 `assistantExecutionApiClient.prepareQueuedExecution()` 和后端 `/prepare` thin boundary 已存在；Slice 173 后主浏览器 `createCanvasAgentApi().prepareQueuedExecution()` 已存在；Slice 174 后默认 server runner 已接到 `PI_BRIDGE_SERVICE.chat(mode="actions")`；Slice 180 后前后端 storage reload 会把遗留 executing 安全暂停。完整验收仍必须覆盖后端历史入口、完整跨重启冲突策略和真实 8777 live smoke；不能把 main API + thin boundary + offline runner wiring 误判成 live 8777 验收完成。 |
| 视频安全线 | Act 模式含视频生成时，未点“授权视频”不执行视频生成。 |
| 人话 timeline | 当前已完成 Orchestrator 最小人话化：常见技术 action 不再把英文 `Running:/Completed:/Failed:` 前缀或 `queue_generation_task` 直接展示给普通用户；完整验收仍要求扩展更多 action type、错误详情中文化，并且开发者模式才查看 JSON。 |
| 8777 规则 | 自动测试不得启动、停止、检查、探测 `8777`；live 测试必须等用户确认服务就绪。 |

### 18.5 当前环境测试约束

| 约束 | 说明 |
|---|---|
| CodeGraph | 本轮默认 `codegraph_status` 返回 `CodeGraph not initialized for this project. Run 'codegraph init' first.`，显式 `projectPath` 返回 `database is locked`。结构检索失败时允许降级使用 `rg` 和定向文件读取；若后续需要恢复 CodeGraph，应先让用户确认是否运行 `codegraph init -i`。 |
| Node | 当前环境 `npm` 可能不在 PATH；可使用 `D:\Aic\node.exe --test` 和 `D:\Aic\node.exe --check` 验证 JS。 |
| TS/JS mirror | `integrations/pi_canvas_agent/src/*.ts` 和运行时 `.js` 目前需要手动保持同步，不能只改 TS 后假设构建会生成 JS。 |
| 中文编码 | PowerShell here-string 曾导致中文写成连续问号；写中文文档和 skill 文件后必须检查连续问号和 mojibake。 |
| 8777 | 不做自动探测；需要 live 联调时停下来等用户确认服务已就绪。 |

## 19. 分阶段落地路线

### Phase 1：统一 Skill Registry 与 Intent/Plan/Actions 基础

目标：让技能真正成为 AI 行动编译器。

当前结论：Phase 1 最小闭环已完成。Slice 120-127 已经完成并验证：统一 skill loader、内置 v2 skills、Claw/PI/Canvas Skills adapter、Assistant Response Contract v2、v2 skill offline runner、Act 模式视频授权安全线均已收口。Phase 2 已完成输入框上方执行抽屉、store/API/history/队列查看/时间线滚动/节点聚焦的最小闭环。Phase 3 已完成 Orchestrator 核心首片、pause/resume cursor、抽屉暂停/继续、非视频确认、视频授权、重试、后端扩展字段持久化、视频 retry 授权安全门、Timeline Humanizer 最小切片、selected-event 重试/跳过/授权视频、dependency_blocked 最小依赖恢复、源事件依赖详情、队列调度/提示/控制/后端同步、queued prepare/recompile、`queued_draft`、mixed queue 置顶排序、prepare_failed 结构化分类与跨重启安全暂停最小闭环。Slice 182-218 已把自然语言队列/当前任务控制推进到本地 mini-interpreter + 澄清卡片 + relation 短答首片：单项/全部队列控制、当前任务控制、broad 命令澄清、序数/重排/交换/operation plan、标题/类型/prompt-content/资产字段引用、最近引用代词、同一本地会话恢复、最近引用前/后相邻项、`它旁边那个` 左右歧义澄清与澄清后 `前面的/后面的` relation 短答执行均已离线验证。完整历史浏览入口、完整 Timeline Humanizer 词库、真实 8777 live 联调、队列失败/视频授权/依赖联动、完整任意自然语言队列编辑、复杂多轮指代、完整依赖重编译/结果合并和 Undo/Replay 仍未完成。

交付：

| 交付项 | 当前状态 | 真实代码依据 | 剩余动作 |
|---|---|---|---|
| `config/assistant-skills-v2/*` 目录结构 | 已完成 | `config/assistant-skills-v2/{canvas_layout,prompt_preset_generation,asset_usage,storyboard_workflow}/` | 目录格式不重写；后续只补质量断言和 fixture。 |
| skill loader、matcher，兼容旧 skill | 已完成 | `services/claw_skill_registry_service.py` | 保持默认 v2 + legacy 加载；项目级 override 另开切片。 |
| 旧字段迁移 | 已完成 | `qualityRubric -> qualityRules` 已有测试 | 后续 v2 合同中统一展示 `qualityRules`。 |
| Claw Skill Adapter | 已完成最小闭环 | `ClawBridgeService._build_prompt_payload()` 注入 `assistantSkills`；`parse_claw_output()` 透传 v2 contract | 后续重点不是重新注入 skill，而是让 Orchestrator 消费 v2 plan/actionsByStep，并把执行状态写入前端/后端 execution store。 |
| PI Skill Adapter | 已完成最小闭环 | `huanyingTools.ts/js`、`piClient.ts/js`、`protocol.ts/js`，真实 completion prompt 测试含 `Unified Skill Registry v2`，v2 contract 可透传 | 后续重点不是重新做 PI prompt，而是把 PI 返回的 v2 contract 纳入 Orchestrator、timeline 和前后端 execution 同步。 |
| Canvas Skills Adapter | 已完成最小闭环 | `canvasSkillIdsForV2Skill()`、`canvasSkillCallsForV2Skill()`、`canvasSkills/index.js`、`assistantCanvasSkillRegistry.js` | 后续接入 timeline trace；视频确认安全线已完成前端/preview/Canvas Skill policy 最小闭环，Phase 3 Orchestrator 已在 v2 授权视频和视频 retry 路径复用同一安全门。 |
| 四个场景技能 | 已完成 | 4 个 v2 skill 目录、默认 registry 测试、`tests.json` offline runner | 后续扩展 fixture 和质量规则。 |
| Assistant Response Contract v2 | 已完成最小透传 | `modules/assistant/assistantProtocol.js`、`integrations/pi_canvas_agent/src/protocol.ts/js`、`piClient.ts/js`、`services/pi_bridge_service.py`、`services/claw_bridge_service.py` | 前端 `assistantExecutionStore` 和只读执行抽屉已消费；后端 Project Execution Store/route 已完成最小可写入口；Orchestrator 已消费 v2 plan/actionsByStep 做逐 action 调度。Undo/Replay 尚未消费。 |
| Skill 离线测试 | 已完成最小闭环 | `services/assistant_skill_v2_offline_runner.py`、`tools/run_assistant_skill_v2_offline_tests.py`，默认 4 个 `tests.json` case 全通过 | 后续扩展 allowedActions/forbiddenActions/qualityRules 深度断言。 |
| 视频安全债 | 已完成最小闭环 | `appAssistantPanel.js`、`assistantInteractionCards.js`、`assistantActionPreviewModel.js`、`canvasSkills/registry.js`、`assistantExecutionOrchestrator.js` | Orchestrator 已补上 v2 授权视频执行、视频 retry 未授权安全门和 selected-event 视频授权 UI；后续后端执行链路和 dependency_blocked 恢复路径仍要继续重复校验视频授权。 |

验收：

- 用户说“整理画布”命中 `canvas_layout`。
- 用户说“用预设生成图片”命中 `prompt_preset_generation`。
- 用户说“拿这个资产做图”命中 `asset_usage`。
- 用户说“做 6 个分镜”命中 `storyboard_workflow`。
- Claw、PI、Canvas Skills 三条链路都能读同一 skill id 和同一 allowedActions。
- 旧 skill 文件不丢失、不乱码、不破坏现有 Claw 注入。
- 普通响应仍兼容旧 `actions` 字段，但新 UI 能读到 `plan` 和 `actionsByStep`。

Phase 1 收口切片状态：

1. Canvas Skills Adapter 最小闭环：已完成。
2. PI 默认加载 v2 skills：已完成。
3. Assistant Response Contract v2：已完成最小透传。
4. Skill offline runner：已完成最小闭环。
5. 视频安全债修复：已完成最小闭环；Act 模式不再自动授权视频，真实视频生成任务仍需确认/授权。

### Phase 2：输入框上方执行抽屉 MVP

目标：让用户看到 AI 的计划和执行过程。

当前状态：Phase 2 已完成前端 store、面板 v2 response 写入 store、输入框上方收起态执行抽屉、展开态只读计划/时间线、抽屉“授权视频”按钮最小切片、“待确认/草稿状态下真实视频 action 必须显示授权视频”的文案安全切片、后端 execution service/route/dispatcher allowlist 最小闭环、前端 Execution API 尽力同步最小闭环、展开态任务队列横条和时间线详情文本最小 UI、后端 execution 历史加载到前端 store/抽屉最小闭环、展开态队列卡片切换查看最小闭环、展开态时间线滚动策略最小闭环，以及前端本地时间线事件节点聚焦最小操作；Phase 3 已完成 Orchestrator 核心首片、pause/resume cursor，并把抽屉“暂停/继续”、非视频 v2 “确认”、v2 “授权视频”、抽屉级“重试”、selected-event “重试此步”、selected-event “跳过此步”和 selected video event “授权视频”接到真实 Orchestrator；后端已完成拓展 timeline 字段、`orchestratorState` 和 `queuePaused` 持久化最小闭环，并已接入 `queue-control` route/client；视频 retry 未授权安全门、Timeline Humanizer 最小切片、dependency_blocked 最小依赖恢复、源事件依赖详情 UX、Slice 162 队列入队/完成后自动拉起下一项、Slice 163 队列较长提示、Slice 164 展开态队列取消/置顶/暂停/继续前端本地最小闭环、Slice 166 队列控制后端同步最小闭环，以及 Slice 169-180 queued prepare/fail-closed/app latest context API boundary + main browser API + backend prepare thin boundary + default server runner + queued_draft 最小闭环 + mixed queue 置顶排序修复 + prepare_failed 结构化分类 + 跨重启安全暂停已完成；Slice 181 已修复本 PRD 中方案 B 目标态与真实 UI/状态机边界；Slice 182-209/211/212/213/214/216/218/219/221 已完成自然语言队列/当前任务本地控制、取消全部、当前任务暂停/继续/取消、broad 命令澄清、短回答执行、按钮执行、卡片完成/禁用态、latest-message 历史恢复、completed card 本地持久回写、旧澄清自动归档、指定位置移动、完整序数列表全量重排、两项交换、两类受控三项局部重排、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词歧义本地澄清、标题歧义候选短回答/按钮执行、生成类型语义引用首片、prompt/content 内容语义引用首片、资产字段级语义引用首片、最近一次命中任务代词指代首片、同一本地会话 restore 后 recent reference 恢复首片、最近引用前/后相邻项指代首片、`它旁边那个` 左右歧义澄清首片、澄清后 `前面的/后面的` relation 短答执行首片、同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动首片，以及同一本地 conversation restore 后最近两个引用重建首片、同一本地会话最近三个明确队列控制对象的 `刚才那三个` 成组移动首片；完整历史浏览入口、完整 Timeline Humanizer 词库、timeline 单 action undo、完整依赖重编译/结果合并、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、复杂多轮指代、不同会话/跨设备/后端消息同步 recent reference、真实 8777 live 联调、队列失败/视频授权/依赖联动和完整任意自然语言队列编辑仍未完成。

交付：

| 交付项 | 当前状态 | 真实代码依据 | 下一步 |
|---|---|---|---|
| `assistantExecutionStore` 前端项目级 store | 已完成最小闭环 | `modules/assistant/assistantExecutionStore.js`、`modules/assistant/assistantExecutionStore.test.js` | 已接入 `appAssistantPanel.js` v2 response 写入，并已被输入框上方抽屉读取；后端 route、前端 API 尽力同步、`importExecutions()` 历史导入、timeline `nodeIds` 保留和 Orchestrator 状态推进已可用，下一步补完整历史入口、完整依赖重编译/结果合并和 Undo/Replay。 |
| `assistantExecutionApiClient` 前端 API 同步 | 已完成最小闭环 | `modules/assistant/assistantExecutionApiClient.js`、`modules/assistant/assistantExecutionApiClient.test.js`、`modules/app/appAssistantPanel.test.js` | v2 response 新建 execution 后会 upsert 后端并 append 初始 timeline event；面板 init 会通过 `listExecutions({ projectId })` 加载后端历史；Orchestrator 已使用 `updateExecutionStatus()` 做状态 PATCH；Slice 166 后 queued 卡操作会调用 `controlQueuedExecution()` 做 best-effort 后端同步；后端失败不会打断本地 store。后续要补分页/筛选历史浏览、后端执行链路视频授权 parity 和 Undo/Replay。 |
| `appAssistantPanel.js` 写入 execution store | 已完成最小闭环 | `modules/app/appAssistantPanel.js`、`modules/app/appAssistantPanel.test.js` | 当前创建 execution、初始 timeline，并尽力同步后端；执行进度、失败、完成状态已由抽屉/Orchestrator 最小更新，常见技术 action 已有人话 timeline 摘要，selected-event retry/skip/video authorization 已接入。后续补完整历史入口、完整 Timeline Humanizer 词库、完整依赖重编译/结果合并和 Undo/Replay。 |
| `canvas_agent_execution_service.py` 后端项目级 service | 已完成 timeline/orchestrator 扩展字段持久化、队列控制同步和 queued_draft prepare 晋级最小闭环 | `services/canvas_agent_execution_service.py`、`canvas_agent_execution_service_test.py` | 前端已能调用 upsert/append timeline/status PATCH；后端已保留 `nodeIds/error/canRetry/canUndo/durationMs/orchestratorState`，避免后端历史导入后丢失聚焦/重试/暂停依据；Slice 166 后也会保留 `queuePaused`，并支持 queued/queued_draft 任务置顶/暂停/继续/取消；Slice 175 后 queued_draft prepare 必须有 fresh actions 才晋级 queued。后续补历史浏览、依赖恢复、撤销语义和 Replay。 |
| `/api/v2/canvas-agent/executions/*` 路由 | 已完成基础、队列控制与 prepare thin boundary 最小闭环 | `services/canvas_agent_route_service.py`、`services/http_route_dispatcher.py`、`http_route_dispatcher_test.py`、`canvas_agent_route_service_test.py` | 支持 list/get/upsert/append-event/update-status/clear-completed、`PATCH /api/v2/canvas-agent/executions/{id}/queue-control`，以及 Slice 172 的 `POST /api/v2/canvas-agent/executions/{id}/prepare` thin boundary。后续新增子能力继续走该 namespace，不走 `/api/v2/assistant/executions/*`；真实 runner 未接入时 prepare 对已有 execution 返回 501。 |
| 输入框上方独立执行抽屉 | 部分完成 | `modules/app/appAssistantPanel.js` 已在 compose 内渲染 `.hy-canvas-agent-execution-drawer`，消费 `assistantExecutionStore.snapshot()`；已支持收起态、展开/收起切换、只读计划/时间线、展开态任务队列横条、队列卡片切换查看、队列较长提示、queued 卡置顶/暂停/继续/取消、时间线详情文本、时间线滚动策略、选中事件聚焦受影响节点、选中 `canRetry=true` 事件“重试此步”和“跳过此步”、选中未授权视频事件“授权视频”、视频授权按钮、v2 确认/授权视频/暂停/继续/抽屉级重试 Orchestrator-backed 行为，以及 init 后端历史导入后的抽屉刷新；Orchestrator 写入的常见技术 action timeline 已是中文摘要。 | 继续实现 timeline 单 action undo、完整历史入口、完整 Timeline Humanizer 词库、完整依赖重编译/结果合并和 Undo/Replay。 |
| 收起态两行状态 | 已完成最小闭环 | `modules/app/appAssistantPanel.p1Ui.test.js` 验证 line1/line2、展开按钮、确认按钮和输入框上方位置；Slice 163 已补展开态队列较长提示。 | 后续补收起态真实队列数量、视频授权态、失败态等完整状态文案。 |
| 右下角水平操作按钮 | 部分完成 | 抽屉已有展开按钮；普通非视频旧 pending action 仍可显示“确认”并走现有确认/apply 路径，且不会携带 `videoAuthorized`；非视频 v2 execution 的“确认”已调用 Orchestrator；`waiting_video_authorization`、旧 pending actions 含真实视频生成、或 v2 `actionsByStep` 含未授权真实视频生成时显示“授权视频”；v2 execution 的“授权视频”已在显式授权后调用 Orchestrator 并传 `videoAuthorized:true`；`暂停/继续`、抽屉级 `重试`、selected-event “重试此步/跳过此步”和 selected video event “授权视频”已接入 Orchestrator。 | 后续补 undo 详情按钮、完成总结关闭按钮、后端视频授权 parity、完整依赖重编译/结果合并和完整历史入口。 |
| 展开态计划/时间线/详情 | 部分完成 | `.hy-canvas-agent-execution-plan`、`.hy-canvas-agent-execution-timeline`、`.hy-canvas-agent-execution-queue` 和 `.hy-canvas-agent-execution-event-detail` 已可只读展示 plan steps、timeline events、当前/排队任务和选中事件详情；点击排队任务卡会切换主区域查看该任务计划/时间线，并保持 active execution 与 queue 顺序不变；时间线默认滚到底，用户手动上滚后暂停自动滚动 5 秒再恢复；前端本地事件包含 `nodeIds`/关联 action 节点 id 时显示“聚焦对象”并调用 `graphStore.setSelectedNodes()`；Slice 154 后，选中 `canRetry=true` 且有 `actionId` 的事件会显示“重试此步”，点击调用 Orchestrator retry；Slice 155 后同类非视频事件会显示“跳过此步”，点击调用 Orchestrator skip；Slice 158 后选中未授权视频事件会显示“授权视频”，点击调用 Orchestrator retry 并传 `videoAuthorized:true`；Slice 160 后选中失败/跳过源事件会显示“后续 N 步依赖这一步”及被阻塞步骤名；常见技术 action 已由 Orchestrator 写成中文摘要。 | 继续实现 undo 详情按钮、开发者详情、完整 Timeline Humanizer 词库和编辑/重排。 |
| Plan / Act 模式 UI 规则 | 部分完成 | Plan/Act 切换和视频安全线已存在 | 与抽屉和 Orchestrator 规则统一。 |
| 视频待授权强提示状态条 | 部分完成 | Act 视频不会自动授权；card/preview 已要求确认；v2 抽屉授权视频已显式传 `videoAuthorized:true` 给 Orchestrator；视频 failed cursor retry 未授权时会停在 `waiting_video_authorization`；selected video timeline event 已能显示“授权视频”并以 `videoAuthorized:true` 重试该 action。 | 继续补后端执行链路同等安全门、dependency_blocked 恢复路径中的重复授权门和完整历史呈现。 |

验收：

- Plan 模式只生成计划，不执行。
- Act 模式生成计划后自动执行低风险步骤。
- Act 模式遇到视频生成时停在“授权视频”，不执行视频生成。
- 抽屉可展开、收起；执行中日志持续追加并自动滚到底部。
- 有视频待授权、阻塞失败、高风险确认时，点击聊天区不能完全隐藏抽屉，只能收起到状态条。
- 关闭完成总结后，项目级 execution 仍可找回。

当前真实验收边界：前 4 项已有最小代码覆盖或部分覆盖；“执行中新 v2 response 入队 + 当前任务成功完成后自动拉起首个非暂停 queued 任务”已有最小代码覆盖；“队列超过 5 个时展开态显示队列较长提示但继续排队”已有最小代码覆盖；“展开态 queued 任务取消/置顶/暂停/继续且不打断 active task”已有前端本地最小代码覆盖；“queuePaused 后端持久化/queue-control API 同步”已有 Slice 166 最小代码覆盖；“queued 任务轮到执行前 Orchestrator 调用注入式 prepare hook 并执行刷新后 action”已有 Slice 169 核心测试覆盖；“prepare 失败 fail-closed 不执行旧 actions”已有 Slice 170 核心测试覆盖；“prepare_failed 结构化分类（missing_prepare_hook/prepare_threw/invalid_prepare_result/missing_fresh_actions）”已有 Slice 179 focused Orchestrator 测试覆盖；“默认 app 轮到 queued 任务前读取 latest canvas context 并调用显式 prepare API boundary”已有 Slice 171 UI/集成测试覆盖；“主浏览器 API prepare 暴露”已有 Slice 173 Node 测试覆盖；“默认 server prepare runner 接到 `PI_BRIDGE_SERVICE.chat(mode="actions")`”已有 Slice 174 Python 离线测试覆盖；“点击聊天区收起但保留强提示状态条”“关闭完成总结后从完整历史入口找回”“收起态真实队列数量”“真实 8777 live smoke/端到端队列重编译验收”仍未通过真实代码验收，后续必须单独补 UI、后端和状态机测试。

### Phase 3：时间线、失败恢复、重试

目标：让每个 action 可追踪、可重试。

当前状态：Phase 3 已完成 Slice 143、Slice 144、Slice 145、Slice 147、Slice 148、Slice 149、Slice 150、Slice 151、Slice 152、Slice 154、Slice 155、Slice 157、Slice 158、Slice 160、Slice 162、Slice 163、Slice 164、Slice 166、Slice 169-180，以及 Slice 182/183/185/186/188/189/190/192/193/194/195/196/197/198/199/200/201/202/203/205/206/207/208/209/211/212/213/214/216/218/219/221 的自然语言队列/当前任务本地控制、broad 命令歧义确认、短回答执行、按钮执行、卡片完成/禁用态、latest-message 历史恢复、completed card 本地持久回写、旧澄清自动归档、指定位置移动、完整序数列表全量重排、两项交换、两类受控三项局部重排、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词歧义本地澄清、标题歧义候选短回答/按钮执行、生成类型语义引用首片、prompt/content 内容语义引用首片、资产字段级语义引用首片、最近一次命中任务代词指代首片、同一本地会话 restore 后 recent reference 恢复首片、最近引用前/后相邻项指代首片、`它旁边那个` 左右歧义澄清首片、澄清后 `前面的/后面的` relation 短答执行首片、同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动首片、同一本地 conversation restore 后最近两个引用重建首片、同一本地会话最近三个明确队列控制对象的 `刚才那三个` 成组移动首片；`timelineSummary()` 已把常见技术 action 转成人话中文摘要，并把原始 action 保留到 `developer.actionJson`。该阶段仍未实现完整任意自然语言队列编辑、连续多次相邻跳转、无明确数量的“刚才那几个/那一组”多对象、不同会话/跨设备/后端消息同步 recent reference、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、拖拽/可编辑计划板联动、完整队列联动策略、真实 8777 live 联调、完整 Timeline Humanizer 词库、依赖重编译/结果合并、Undo 或 Replay。

真实代码状态拆解：

| 能力 | 当前真实代码状态 | 后续才算完成 |
|---|---|---|
| 逐 action 执行 | 已完成最小闭环；`run()` 会按 plan/action 顺序逐个 validate/execute 并写 timeline。Slice 157 已新增最小 dependency map 和 `dependency_blocked` 事件。 | 增加完整 DAG 重编译、action target、duration 真实耗时和更细粒度状态。 |
| 暂停/继续/取消 | 暂停/继续已完成当前 action 后暂停、从 cursor 继续；取消已完成当前 action 后写 `cancelled` 并停止后续 action，不强杀已发起 action。Slice 164 已完成 queued 任务暂停/继续排队的前端本地最小闭环；Slice 166 已补 queued 暂停/继续/取消的后端同步；Slice 186 已补 active 当前任务取消。 | 复杂失败/视频/依赖队列场景联动、底层生成任务强杀和跨重启冲突策略仍需补。 |
| 重试 | 已完成 failed execution cursor-level retry；未授权视频 retry 会停在 `waiting_video_authorization`；Slice 154 已完成选中 timeline event 后按 `actionId` 定位 cursor 的最小单 action retry；Slice 157 已让依赖失败时阻塞下游并继续无依赖动作；Slice 158 已让 selected video event 通过“授权视频”以 `videoAuthorized:true` 重试该 action。 | 重试后依赖步骤重编译、重试结果合并、后端执行链路授权 parity 仍需补。 |
| 跳过 | 已完成最小闭环；`orchestrator.skip(executionId, { actionId, eventId })` 已按 `actionId` 定位 action，追加 `skipped` timeline event，保存 `developer.skippedFromEventId/actionJson`，推进 `progress` 与 `orchestratorState.nextActionIndex`；UI 详情区已显示 `.hy-canvas-agent-execution-detail-skip`“跳过此步”；Slice 157 已让 skip 上游 step 时阻塞依赖它的后续 action。 | 这是 selected-event skip + dependency_blocked 的最小闭环；跳过后下游重编译、队列联动和 Undo 仍未完成。 |
| 依赖恢复 | 已完成最小闭环；Orchestrator 会读取 `plan.steps[].dependsOn`，失败/跳过上游 step 后写 `dependency_blocked` timeline event，停在第一个阻塞 action cursor，并继续执行无依赖后续 action；Slice 160 后，前端展开态选中源事件会显示“后续 N 步依赖这一步”与被阻塞步骤名。 | 仍需 action 输出级依赖、重试/跳过后的 DAG 重编译、结果合并和跨重启后的依赖冲突处理。 |
| 队列状态机 | 已完成最小同步闭环：执行中新 v2 response 会入队，Slice 175 后默认保存为 `queued_draft`；当前 execution 成功完成后自动拉起首个非暂停 queued/queued_draft 任务；超过 5 个排队任务会显示“队列较长”但继续允许入队；展开态队列卡片可置顶、取消、暂停/继续排队，自动调度会跳过暂停排队任务；Slice 166 后 queued 控制会通过后端 `queue-control` route/client best-effort 同步，且后端保存 `queuePaused` 并按 `queueIndex` 返回 queued/queued_draft 列表；Slice 169-180 后 Orchestrator 支持注入式 prepare hook、prepare 成功刷新和失败 fail-closed；Slice 171 后默认 app 支持 latest context + 显式 prepare API boundary；Slice 172 后 execution client + 后端 `/prepare` thin boundary 已存在；Slice 173 后主浏览器 API prepare 暴露已存在；Slice 174 后默认 server prepare runner 已接入；Slice 175 后 queued_draft 必须 prepare 且必须返回 fresh actions 才晋级 `queued` 执行；Slice 177 后 mixed queued/queued_draft 置顶排序已补 TDD 并修复；Slice 179 后 prepare_failed timeline 会写入 `developer.prepareErrorKind/prepareErrorMessage`；Slice 180 后 storage reload 会把遗留 executing 安全暂停并保留队列顺序；Slice 196-209/211/212/213/214/216/218/219/221 后自然语言队列指定位置移动、完整序数列表全量重排、两项交换、两类受控三项句式、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词同分歧义澄清与候选执行、生成类型语义引用、prompt/content 内容语义引用、资产字段级语义引用、最近一次命中任务代词指代、同一本地 conversation restore 后 recent reference 恢复、最近引用前/后相邻项指代、`它旁边那个` 左右歧义澄清、澄清后前/后短答执行，以及同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动、同一本地 conversation restore 后最近两个引用重建，以及同一本地会话最近三个明确队列控制对象的 `刚才那三个` 成组移动，已经通过本地 parser 与后端 `move/reorder` 同步形成最小闭环。 | 真实 8777 live 联调、复杂自然语言语义版（连续多次相邻跳转、无明确数量的“刚才那几个/那一组”多对象、不同会话/跨设备/后端消息同步 recent reference、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、复杂歧义选择、拖拽计划板联动）、失败/视频授权/依赖恢复联动、完整跨重启冲突策略。 |
| Timeline Humanizer | 已完成最小中文摘要。 | 更多 action type、失败原因中文化、开发者 JSON 面板和旧历史迁移。 |

交付：

- Execution Orchestrator：已完成最小闭环。
- action timeline store 和 timeline event：已完成最小闭环，后端扩展字段已持久化。
- action 状态机：已完成 running/completed/failed/waiting_video_authorization/paused/cancelled 最小路径，selected-event skip 会写入 `skipped` timeline event，依赖阻塞会写入 `dependency_blocked` timeline event；仍缺 undo/replayed 等状态。
- 任务队列状态机：已完成最小入队、`queued_draft` 防陈旧执行、完成后自动拉起首个非暂停队列任务、队列较长提示、展开态取消/置顶/暂停/继续控制、后端 `queuePaused` 持久化与 `queue-control` route/client 同步、Orchestrator 注入式 prepare hook、prepare 失败 fail-closed、默认 app latest context + 显式 prepare API boundary、主浏览器 API prepare 暴露、后端 `/prepare` thin boundary、mixed queued/queued_draft 置顶排序修复、prepare_failed 结构化分类、跨重启安全暂停，以及自然语言单项队列控制、`取消全部排队任务`、指定位置队列移动、完整序数列表全量重排、两项交换、两类受控三项局部句式、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词歧义本地澄清、标题歧义候选短回答/按钮执行、生成类型语义引用、prompt/content 内容语义引用、资产字段级语义引用、最近一次命中任务代词指代、同一本地会话 restore 后 recent reference 恢复、最近引用前/后相邻项指代、`它旁边那个` 左右歧义澄清、澄清后 `前面的/后面的` relation 短答执行、同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动、同一本地 conversation restore 后最近两个引用重建、同一本地会话最近三个明确队列控制对象的 `刚才那三个` 成组移动、当前任务暂停/继续、当前任务取消、broad 命令歧义确认、澄清后短回答执行、澄清按钮点击执行、澄清卡片完成/禁用态、latest-message 澄清历史恢复、completed card 本地持久回写和旧澄清自动归档最小闭环；仍缺真实 8777 live 联调、完整任意自然语言队列编辑、连续多次相邻跳转、无明确数量的“刚才那几个/那一组”多对象、不同会话/跨设备/后端消息同步 recent reference、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、拖拽计划板联动、失败/视频授权/依赖联动。
- 队列超过 5 个提示但继续排队：已完成最小 UI/状态提示。
- 失败依赖处理：已完成最小闭环；无依赖后续 action 可继续，有依赖后续 action 会写 `dependency_blocked` 并暂停。
- 重试、跳过、暂停、继续、取消：暂停/继续/取消已完成最小闭环；重试已完成 failed execution cursor 级别和 timeline event `actionId` 定位的最小闭环；跳过已完成 selected-event `actionId` 定位的最小闭环。
- 逐步 validate、逐步 execute、pause cursor、resume cursor：已完成最小闭环。
- 开发者详情：developer 数据已存储，完整 UI 面板未完成。

验收：

- 每个 action 有状态、对象、耗时、错误摘要；当前已有状态/错误摘要和 `durationMs` 字段持久化，但 Orchestrator 尚未计算真实 duration，也未形成结构化 `target` 对象。
- 失败 action 可重试；当前已验收 failed execution cursor-level retry 和选中 timeline event 的 `actionId` 定位 retry；失败 action 可跳过的 selected-event 最小闭环也已验收，但不验收依赖重编译、结果合并或 undo。
- 无依赖步骤可继续执行；Slice 157 已完成最小验收。
- 有依赖步骤会暂停；Slice 157 已完成最小验收，阻塞项会写 `dependency_blocked`；Slice 160 已完成源事件详情“后续 N 步依赖这一步”的最小 UX 验收。
- 暂停后不推进后续 action；已发起生成任务默认不强杀；当前已完成最小验收。
- 普通用户 timeline 不显示技术 action 名，开发者模式才显示 JSON；当前已完成常见 action 的最小验收，完整词库和开发者 UI 未完成。
- 旧 batch executor 仍可被 Orchestrator 调用，旧 `actions` 合同不回归。

### Phase 4：Undo / Replay

目标：让 AI 操作可撤销、可回放。

交付：

- action inverse 数据。
- AI ownership 标记。
- 撤销到某个步骤，且只在 `canUndo=true` 时开放 UI。
- Replay 结构动作。
- 文本/图片生成手动重新生成入口。
- 用户后续手动修改冲突检测。

验收：

- 撤销只撤销 AI 自己的变更。
- 用户手动修改被保留。
- 生成资产撤销后仍保留在资产库。
- Replay 默认不重新生成图片/文本。
- 缺少 inverse 的 timeline 步骤不显示可点击撤销。
- 视频 replay 必须重新授权。

当前真实代码边界（Slice 222-225 后）：

- Phase 4 首片已落地：`create_node`/`connect_nodes` 成功执行后，completed 事件携带 `inverse.ops`（`remove_node` 含创建时签名、`remove_edge`）、`aiOwned:true` 与 `canUndo:true`；生成类动作仍 `canUndo:false` 且无 inverse。
- `assistantExecutionStore.sanitizeTimelineEvent()` 与后端 `CanvasAgentExecutionService._sanitize_inverse()` 均持久化并脱敏 `inverse`；无效 op 类型会被丢弃，无 inverse 的事件不写该 key。
- `assistantExecutionOrchestrator.undo(executionId,{eventId})` 已存在：成功写 `undone`、全部冲突写 `undo_conflict`、hook 抛错写 `undo_failed`、重复撤销返回 `already_undone`、运行中/缺 inverse/缺 hook 返回 `undo_unavailable`。
- `appAssistantPanel.js` 详情区已渲染“撤销此步”（仅对有 inverse 且未撤销的事件）；默认 wiring 用 `graphStore.removeNode/removeEdge` 删除 AI 创建对象，节点缺失或签名不一致（用户修改）会保留画布并写 conflict——满足“撤销只撤销 AI 自己的变更、用户手动修改被保留”。
- 仍未做：`update_node`/`layout_nodes/move_nodes` 的属性级 inverse、多步“撤销到这里”回滚、Replay 结构动作、文本/图片手动重新生成入口、视频 replay 重新授权。生成资产不受撤销影响（生成动作不可撤销，资产保留在资产库）。
- 后续扩展 Undo 时必须保持：缺少 inverse 的事件不显示可点击撤销；视频 replay 必须重新授权。

### Phase 5：质量提升与 Wow 能力

目标：让功能从可用升级为专业创作体验。

交付：

- Auto Layout Pro 质量评分。
- 资产智能增强。
- Storyboard workflow 质量检查。
- Golden cases 自动回归。
- 失败自动转测试用例。

验收：

- 整理画布结果明显更清楚。
- 资产存在时不再轻易说找不到。
- 分镜工作流结构稳定。
- 真实失败案例能沉淀为回归测试。

## 20. 成功指标

| 指标 | 目标 |
|---|---|
| Skill 命中准确率 | 核心四类场景 > 90%。 |
| action 合法率 | 通过 schema 校验 > 95%。 |
| 低风险自动执行成功率 | > 85%。 |
| 失败可恢复率 | 失败后能重试/跳过/撤销 > 90%。 |
| 用户误执行投诉 | 显著下降。 |
| 未授权视频生成 | 0 起。 |
| 预设提示词误展示 | 0 起回归。 |
| 资产存在但找不到 | 显著下降，并有测试覆盖。 |
| 自动整理画布满意度 | 人工验收通过率 > 80%。 |
| 三链路 skill 一致性 | Claw、PI、Canvas Skills 对核心四类场景命中同一 skill id。 |
| execution 可找回率 | 关闭总结、切换会话、重开面板后仍可找回完整 execution > 99%。 |

## 21. 与现有系统的关系

本 PRD 不推翻现有能力，而是在现有基础上加一层统一编排：

```text
现有：
用户 -> 聊天 -> 模型 -> actions -> preview -> executor

新增：
用户 -> Intent -> Skill Registry -> Plan -> Actions -> Timeline -> Undo/Replay
```

应复用：

- 现有 `assistantContextBuilder` 上下文提取。
- 现有 `assistantConversationStore` 会话存储。
- 现有 Canvas Skills runtime。
- 现有 action schema。
- 现有 action executor。
- 现有 prompt preset generation 动作。
- 现有 asset list/use/add 能力。

新增但不替代：

| 新模块 | 与现有模块关系 |
|---|---|
| Unified Skill Registry v2 | 包装并迁移旧 `claw_skill_registry_service.py`，同时给 PI 和 Canvas Skills 提供 adapter。 |
| Assistant Response Contract v2 | 兼容旧 `reply/actions/warnings/requiresConfirmation`，但新 UI 优先使用 `intent/plan/actionsByStep/execution`。 |
| Execution Orchestrator | 调度、暂停、重试、队列和 timeline；底层仍调用现有 action schema、action executor、Canvas Skills runtime。 |
| Project Execution Store | 前端 `assistantExecutionStore` 已有最小单测，UI 已能写入/读取本地 store；后端 `CanvasAgentExecutionService` 和 `/api/v2/canvas-agent/executions/*` route 已有最小回归；前端已能把新 execution 和初始 timeline event 尽力同步后端，并能在面板 init 时从后端加载同项目 execution 历史到 store/抽屉；后端已保留 timeline `nodeIds/error/canRetry/canUndo/durationMs` 与 `orchestratorState`；Orchestrator 已持续写入状态和 timeline，selected-event retry/skip/video authorization 已能按 `actionId` 定位。完整验收还要求关闭总结后可从项目级历史入口找回，并补 Undo/Replay，不依赖旧 conversation transactions 伪造 timeline。 |
| Timeline Humanizer | 把技术 action 转成人话；开发者模式保留 JSON。 |

不允许的伪完成：

- 只新建 `assistant-skills-v2` 文件，但 Claw/PI/Canvas Skills 没有 adapter，不算 Phase 1 完成。
- 只在 UI 里画出计划板，但模型/bridge 不返回 `plan/actionsByStep`，不算计划板完成。
- 只把旧 transactions 展示成列表，不算 Project Execution Store 或 timeline 完成。
- 只在前端挡视频，后端 schema 或 Orchestrator 没挡，不算最终视频安全线完成；当前已完成前端/preview/Canvas Skill policy、v2 授权视频执行、视频 retry 安全门和 selected video event 授权 UI 的最小闭环，但未来后端执行链路和 dependency_blocked 恢复路径仍要重复校验同一规则。
- 只在前端 localStorage 保留 `nodeIds/orchestratorState`，但后端 history 导入会丢这些字段，不算完整 Project Execution Store；Slice 149 已完成后端最小持久化，Slice 150/151 已完成 failed cursor 重试和视频 retry 安全门，Slice 154/155/158 已完成 selected-event retry/skip/video authorization，但完整历史浏览、撤销和 Replay 仍需单独完成。
- 只把 Orchestrator 核心写出来，或只接入非视频确认/视频授权/失败重试/视频 retry 安全门，但没有 selected-event retry/skip、dependency_blocked、undo/replay 语义，不算执行工作台完成；当前 selected-event retry/skip 和 dependency_blocked 已完成最小闭环，但完整依赖重编译/结果合并和 Undo/Replay 仍未完成。
- 只写 skip RED 测试、或只在 PRD 写“跳过此步”，但没有 `orchestrator.skip()`、`skipped` timeline event、cursor 推进和 UI 按钮，不算 skip 完成；Slice 155 已补齐这些最小条件，Slice 157 已补上 skip 后 dependency_blocked 最小闭环，但仍不代表完整依赖重编译/结果合并或 Undo 完成。
- 只显示“撤销到这里”按钮但没有 inverse patch，不算 Undo 完成。

## 22. 风险与对策

| 风险 | 对策 |
|---|---|
| PRD 范围偏大 | 分 Phase 落地，先做 registry 和抽屉 MVP。 |
| 抽屉覆盖聊天造成干扰 | 收起态像输入框一部分；展开态才覆盖聊天，并加轻微渐变/模糊；点击聊天区可收起。 |
| Plan 和 Actions 不一致 | 执行前重新读取画布，必要时重编译受影响步骤。 |
| Undo 误删用户内容 | 标记 AI ownership，用户修改后默认保留。 |
| Skill 变成软提示 | allowedActions、requiredContext、qualityRules 运行时强校验。 |
| 调试信息吓到普通用户 | 默认人话状态，开发者模式才显示 JSON。 |
| 文本/图片无限生成导致耗时 | 用户已确认不设数量限制；时间线必须持续显示进度，执行中可暂停后续 action。 |
| 排队任务过多 | 超过 5 个显示“队列较长”，但仍允许加入队列。 |
| Act 模式误当视频授权 | 明确删除历史逻辑：Act 只代表低风险自动推进，视频必须点击“授权视频”。 |
| 三套 skill 继续分裂 | Phase 1 必须完成 Claw、PI、Canvas Skills 三个 adapter 验收。 |
| UI 先行但无真实 plan 数据 | Assistant Response Contract v2 必须早于抽屉完整 UI。 |
| 暂停按钮无法真正暂停 | Phase 3 必须引入 Execution Orchestrator，不允许直接依赖整批 executor 假暂停。 |
| Undo 入口误导用户 | Phase 4 前缺 inverse 的步骤禁用或隐藏撤销入口。 |
| 8777 被自动化误触 | 测试和接力文档必须写明：不启动、不检查、不探测；live 等用户确认。 |

## 23. 最终产品体验描述

用户输入一句：

```text
帮我根据这个故事做 6 个分镜并生成图片，最后整理画布。
```

Act 模式下，系统表现应该是：

1. 输入框上方出现执行抽屉；抽屉贴着输入框，像输入框的上半部分。
2. 抽屉第一行显示任务名、进度和队列数量；第二行显示最新状态。
3. 系统自动执行低风险步骤：故事大纲、分镜文本、图片生成、连线、整理画布。
4. 执行中第二按钮显示“暂停”；点击暂停后，已发起 action 按类型处理，默认不强杀上游生成任务，只暂停后续队列。
5. 时间线日志持续追加并自动滚到底部；用户手动往上滚后暂停自动滚动 5 秒，随后自动回到底部。
6. 用户继续输入新需求时，新需求全部作为新任务排队；默认抽屉只显示当前任务和队列数量。
7. 队列超过 5 个时仍允许继续排队，只显示“队列较长”提示。
8. 点击展开后，抽屉原地向上展开，最高不超过面板 70%，覆盖聊天区并加轻微渐变/模糊。
9. 展开态顶部显示任务队列横条；下方左侧是计划区，右侧是时间线/详情区。
10. 点击排队任务卡，只切换主区域查看该任务计划/时间线，不改变执行顺序。
11. 点击时间线记录后，右侧区域切换到详情，显示人话说明、影响范围、聚焦、重试、撤销到这里、跳过。
12. 如果某张图失败，失败详情显示“后续哪些步骤依赖它”，无依赖任务继续，有依赖任务暂停。
13. 如果计划包含视频生成，默认抽屉显示待授权，第二按钮文案必须是“授权视频”，点击后只授权当前最近一项。
14. 任务完成后，抽屉保留最近一次任务总结；用户可手动关闭。
15. 关闭总结后，聊天历史保留摘要，项目级 AI 执行历史保留完整计划和时间线。

这就是本 PRD 的目标：把幻映智能体从“会聊天和执行 actions”的助手，升级为“能规划、能自动执行、能解释、能排队、能回滚、能复盘”的画布创作智能体。

## 24. 自检结论

- 没有占位符。
- 已按真实代码把 PRD 推进到 v3.91：Slice 263-267 按用户 7 问规格重构生成确认——真实生成派发才确认（plan=图/视频，act=仅视频），其余自动执行；一次确认放行全部并兼作视频授权（APPLY 退役）；计数文案+徽章+高亮确认的新卡视觉 live 成型；两路（抽屉/旧卡片）同一规则源；line1/line2 重复修复。live：DIRECTOR 7/7、LLM 8/8、IMAGE 5/5、视觉 3/3；JS 全量 637 pass。
- 已按真实代码把 PRD 推进到 v3.90：Slice 256-262 完成 QMAI 接入全部评审项（共享净化、director 技能、第一刀接线删中间 PI、prepare 分流、回执飞轮通道、golden fixture、live 验收）；DIRECTOR E2E 7/7——QMAI 导演判断首次真实驱动画布；JS 567 pass，Python 8 套 OK；三红线未破。
- 已按真实代码把 PRD 推进到 v3.89：Slice 251-255 完成全部剩余路线（指标后端聚合+仪表、图形化 DAG+历史 chips、qualityChecks、语义化触发词、真实图片生成 E2E 5/5）；JS 全量 533 pass，Python 6 套 OK；新发现并记录缺口：Orchestrator 路径不回写 state.generationTasks。架构总览文档已生成至 docs/ARCHITECTURE-canvas-agent.md。
- 已按真实代码把 PRD 推进到 v3.88：Slice 249 让 PI 包装层按本地触发词命中回填 intent.matchedSkills（TS/JS 双镜像、双合同分支、保留模型自带 intent 字段）；Slice 250 经用户指示重启 8777 并 live 双向验证后端强校验、补“分镜”触发词。LLM E2E 升级为 8 项断言复跑全过：matchedSkills=[storyboard_workflow]、skillHitRate=1。JS 全量 529 pass。
- 已按真实代码把 PRD 推进到 v3.87：Slice 241-248 一次完成审计 P0-P2 全部条目（技能强校验+matchedSkills 链路+runner 深度断言、成功指标埋点、Replay/单步重生成、开发者 JSON 面板、真实耗时+target、只读 DAG、历史分页、共享模型规则、无数量词群组引用、真实 8777 LLM E2E）；E2E 发现并修复跨 action 别名解析真实 bug；最终 live 6/6、JS 525 pass、Python 5 套 OK、内置 skill 深度断言 12/12。已记录真实边界：真实 LLM 响应 matchedSkills 为空，需包装层回填后强校验才在真实链路生效。
- 已按真实代码把 PRD 推进到 v3.86：Slice 240 让助手面板模型选择对齐文本生成节点——failed/未测试模型可选可发送、缺配置模型列出但禁用、deleted/disabled 隐藏、默认模型优先非 failed；registry/panel/autoload 测试已更新到新行为，JS 全量 509 pass；真实 8777 live 验证 3/3（failed 状态 gemini-3.1 可见、可选中为当前模型）。
- 已按真实代码把 PRD 推进到 v3.85：真实 `8777`（用户重启为当前代码）完成全量 live 验收——真实 Chromium UI 17/17（含计划停用/重排+后端同步、撤销按钮与冲突保留、遮罩收起、关闭到历史再搜索找回、零页面错误、种子清理），gemini-3.1-pro 完整 v2 contract LLM 应答；发现并修复 Slice 238 fenced-JSON 解析 bug（`stripMarkdownCodeFence()`，TS/JS 双改）；验收脚本归档 `tools/run_canvas_agent_ui_acceptance.mjs`。回归：JS 全量 506 pass / 0 fail。
- 已按真实代码把 PRD 推进到 v3.84：本轮 TDD 完成 Slice 232-237（位置级 inverse、Plan Board 拖拽排序+plan_edited、历史搜索、overlay/blur backdrop、piSdkAdapter /openai 网关 URL 修复、真实 Chromium UI live 验收 17/17）。回归：JS 全量 505 pass / 0 fail（含 PI 集成），Python execution/route/bridge 全过。Live 边界：LLM 链路已打通到真实网关、止步于用户 key 配额封顶；字面 8777 被「幻映工作台1.1.exe」（旧打包代码）占用，自动终止被策略拒绝，需人工关闭后切换。
- 已按真实代码把 PRD 推进到 v3.83：本轮用 TDD 完成 Slice 229（update 类 action 的 `restore_node` 属性级 inverse：执行前 `nodeSnapshotProvider` 快照、执行后签名、undo 恢复 `{name,data}` 并返回 `restoredNodeIds`、签名不一致冲突保留）与 Slice 230（`undoTo()` 多步“撤销到这里”：反向撤销选中及之后全部可撤销事件、跳过已撤销、聚合计数、UI 按钮仅在有后续可撤销事件时显示）；并经用户授权完成 Slice 231 live 联调首轮：`8779` 当前代码实例 executions API 10 项 live 验证、跨重启恢复 live 验证、`restore_node` live 持久化验证全部通过；确认用户 `8777` 长驻实例为旧代码需人工重启。回归：Phase 4 UI 7 pass，JS 全量 469 pass，Python execution service 14 pass。浏览器级 UI live 验收因无头环境限制仍未完成。
- 已按真实代码把 PRD 推进到 v3.82：本轮用 TDD 完成 Slice 222-228。Slice 222/223 为 Phase 4 Undo 运行时首片：`inverseForActionResult()` 在 `create_node`/`connect_nodes` 完成后生成删除型 `inverse.ops`，`undo()` 经注入 `applyInverseOps` 施加反向操作并区分 `undone`/`undo_conflict`/`undo_failed`/`already_undone`/`undo_unavailable`；Slice 224 让前端 store 与后端 service 持久化并脱敏 `inverse`；Slice 225 补抽屉详情区“撤销此步”UI、默认 graphStore 反向操作 wiring、创建时签名对比的用户修改冲突保留，以及 autoload 适配器 `removeNode/removeEdge`；Slice 226 补 Plan Board 步骤启停（store 守卫 + UI toggle + 后端 plan best-effort 同步）；Slice 227 补完成总结“关闭”与“执行历史（N）”找回入口；Slice 228 补点击聊天区收起展开抽屉为状态条。Focused `Phase 4 UI` 为 5 pass / 0 fail，`appAssistantPanel.p1Ui.test.js` 105 pass，app 套件 188 pass，assistant 套件 274 pass，`canvas_agent_execution_service_test.py` 13 pass。本轮未触碰 `8777`。
- 已按真实代码把 PRD 推进到 v3.81：本轮用 TDD 补齐同一本地会话最近三个明确队列引用成组移动首片；`queueControlRecentMultiReferenceCount()` 会识别最近 2/3/4 个引用数量词，`parseQueueRecentMultiReferenceMoveCommand()` 会按数量词取最近 N 个引用并要求当前队列足量命中后才生成 `reorder`。Focused `--test-name-pattern "recent three queue references"` 为 `100 pass / 0 fail`，相关回归为 `179 pass / 0 fail`；本轮未触碰 `8777`。该切片仍不等于无明确数量的“刚才那几个/那一组”、不同 conversation、跨设备/后端消息同步 recent reference、完整语义队列调度器、Plan Board 编辑、Undo/Replay 或真实 live 联调完成。
- 已按真实代码把 PRD 修复到 v3.80：本轮为纯 PRD 修复，核对真实 `modules/app/appAssistantPanel.js`、`modules/app/appAssistantPanel.p1Ui.test.js` 与 `modules/assistant/assistantConversationStore.js` 后，已把 Slice 219 的同一本地 conversation restore 后最近双引用重建补齐到顶部状态、会话存储约束、测试锚点、方案 B 差异、9.10、Phase 2/3、队列状态机和自检结论。运行时事实是：`queueControlReferencesFromMessages()` 会从历史 `queueControl.executionId/executionIds` 重建最近 4 个本地队列控制引用，`queueControlReferenceFromMessages()` 会返回 `recentExecutionIds`，`restoreConversation()` 会恢复 `state.recentQueueControlReferences`；focused `--test-name-pattern "restored conversation reuses recent two queue references"` 历史验证为 `99 pass / 0 fail`，相关回归历史验证为 `178 pass / 0 fail`；本轮未触碰 `8777`。计划编辑、完整 DAG 重编译/结果合并、完整 Humanizer、完整历史入口、完整队列失败/视频/依赖联动、完整任意自然语言队列编辑、连续多次相邻跳转、无明确数量的“刚才那几个/那一组”多对象、不同 conversation/跨设备/后端消息同步 recent reference、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、拖拽/可编辑计划板联动、真实 8777 live 联调、完整跨重启冲突策略、Undo/Replay 仍未完成。
- Slice 167 为文档修复切片：当时已基于真实代码明确 `queued_draft`、队列重编译、fresh canvas context、`prepareQueuedExecution` hook、完成总结历史入口、点击外部收起等能力的真实边界；该历史边界已被 Slice 169-180 推进，当前 `prepareQueuedExecution` 核心 hook、fail-closed、默认 app latest context API boundary、默认 server runner 和 `queued_draft` 最小状态机已落地，但真实 8777 live 联调仍未完成。
- Slice 168 为二次文档修复切片：已基于真实代码和默会知识明确 `dependency_blocked` 只是失败恢复最小闭环、右侧详情还没有 undo/开发者 JSON、Phase 4 仍未落地、队列重编译应作为下一运行时 RED/GREEN 切片、自动化不得触碰 `8777`；该队列重编译缺口已由 Slice 169 在 Orchestrator 核心 hook 层部分推进。
- Slice 169 为真实代码修复切片：已基于当前 `assistantExecutionOrchestrator.js` 与 `assistantExecutionOrchestrator.test.js` 更新 PRD，明确 `prepareQueuedExecution` 核心 hook 已落地并通过离线验证；Slice 170/171 又补齐了 fail-closed 和默认 app latest context API boundary；Slice 173/174 已补主 API 暴露和默认 server prepare runner；Slice 175 已补 `queued_draft` 最小状态机；8777 人工联调边界继续保留。
- Slice 170 为运行时修复切片：`prepareQueuedExecution` 抛错时已经不会从 `runNextQueuedExecution()` 冒泡并继续旧 actions；当前会写 `prepare_failed` timeline、把 queued execution 标记为 failed、打开抽屉并展示错误；Slice 179 后还会写 `developer.prepareErrorKind/prepareErrorMessage`。
- Slice 171 为运行时修复切片：默认 `appAssistantPanel.js` 在 `api.prepareQueuedExecution` 存在时会于 queued/queued_draft 自动执行前重新读取 latest canvas context，并调用显式 prepare API boundary；Slice 172 已补后端 `/prepare` thin boundary，Slice 173 已补主 `createCanvasAgentApi` 暴露，Slice 174 已补默认 server prepare runner wiring，Slice 175 已补 draft 必须 fresh actions 才执行；真实 8777 live 联调仍未完成。
- Slice 176 为纯文档复核切片：CodeGraph 当时 `database is locked`，本轮改用 `rg` 和定向读取核对真实代码；已明确 `queued_draft` 的最小状态机完成，但 `moveQueuedExecutionToTop()` mixed draft 置顶顺序仍需 TDD。该缺口已由 Slice 177 运行时代码修复。
- Slice 178 为纯文档修复切片：本轮继续基于真实代码和默会规则复核 PRD，明确 `queued_draft`、mixed queue 置顶排序、默认 app latest context API boundary、后端 `/prepare` thin boundary、默认 server prepare runner 和轮到执行前 prepare/recompile 均已有离线最小闭环；当时把真实 8777 live 联调、跨重启队列恢复、自然语言控制完整语义版、完整依赖结果合并、完整历史入口、完整 Humanizer、计划编辑/DAG 与 Undo/Replay 继续保留为未完成项；其中 prepare 错误结构化分类已由 Slice 179 补齐，跨重启安全暂停已由 Slice 180 补齐最小闭环。
- Slice 179 为运行时修复切片：已基于 `assistantExecutionOrchestrator.js` 与 focused tests 补齐 live-safe prepare 错误结构化分类；`prepare_failed` timeline 的 `developer.prepareErrorKind` 当前覆盖 `missing_prepare_hook`、`prepare_threw`、`invalid_prepare_result`、`missing_fresh_actions`，并同步写 `developer.prepareErrorMessage`。这只解决离线 Orchestrator 诊断，不代表真实 `8777` live runner、后端 route 错误中文化、完整跨重启冲突策略或 Undo/Replay 完成。
- Slice 180 为运行时修复切片：已基于 `assistantExecutionStore.js`、`CanvasAgentExecutionService` 与前后端 focused tests 补齐跨重启安全暂停；前端 local storage、前端后端历史导入和后端 storage reload 遇到遗留 `executing` 时会恢复为 `paused`、清空 `running`、保留 cursor、追加 `restored_paused` timeline，并保持 queued/queued_draft 队列顺序。它不代表自动续跑、画布变更冲突检测、后端租约/锁或 Undo/Replay 完成。
- Slice 181 为文档修复切片：本轮未改运行时代码，未触碰 `8777`；CodeGraph `database is locked` 后使用 `rg`/定向读取复核真实代码，新增第 2.5 节，把方案 B 的目标体验与当前最小抽屉实现拆开，并把自然语言队列控制明确为下一运行时切片：必须在模型 guard/API 调用前本地拦截，复用现有 queue-control 能力。
- Slice 182 为运行时修复切片：已用 TDD 完成自然语言队列控制最小闭环；本地解析器会在模型 guard/API 调用前拦截“取消第一个排队任务/把第二个任务置顶/暂停下一个任务/继续暂停任务”，调用 execution store 和后端 queue-control best-effort 同步，追加 user/assistant 反馈，并允许无模型配置时发送这类本地命令；同时补了“取消当前任务”“取消第一个节点”不应误判成队列控制的防护测试。
- Slice 183 为运行时修复切片：已用 TDD 补齐自然语言 `取消全部排队任务` 最小闭环；解析器会把 `全部/所有/全都/all` 的取消排队指令映射为 `cancel_all`，在模型 guard/API 调用前逐个取消 queued/queued_draft，保留 active execution，追加 “已取消 N 个排队任务。” 反馈，并对每个取消项调用后端 queue-control best-effort 同步。
- Slice 184 为文档修复切片：未改运行时代码、未触碰 `8777`；CodeGraph 仍为 `database is locked`，本轮使用 `rg`/定向读取核对真实代码和测试，修复 PRD 中自然语言队列控制进度、Phase 2/3 总结、真实代码锚点和自检结论的过期表述。
- Slice 185 为运行时修复切片：已用 TDD 补齐自然语言“当前任务暂停/继续”最小闭环；`sendMessage()` 会在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前拦截“暂停当前任务 / 继续当前任务”，调用当前 active execution 的 `executionOrchestrator.pause(id)` 或 `executionOrchestrator.resume(id,{ agentMode, videoAuthorized })`，追加本地 user/assistant 反馈，且 `canSendMessage(message)` 会让这些命令在无模型配置时可发送。Focused UI 测试和 108 条面板回归已通过；本轮未启动、检查、探测或访问 `8777`。
- Slice 186 为运行时修复切片：已用 TDD 补齐自然语言“取消当前任务”最小闭环；`sendMessage()` 会在模型配置 guard、`api.chat/chatStream` 和 LLM 调用前拦截“取消当前任务”，优先调用当前 active execution 的 `executionOrchestrator.cancel(id)`，运行中任务会在当前 action 完成后写 `cancelled`、停止后续 action 且不会自动拉起 queued；缺 Orchestrator 时 fallback 到 `executionStore.updateStatus(id,"cancelled",...)`。Focused Orchestrator/UI 测试已通过；本轮未启动、检查、探测或访问 `8777`。
- Slice 187 为文档修复切片：本轮未改运行时代码、未触碰 `8777`；CodeGraph 当前返回未初始化，已按项目规则降级为 `rg`/定向读取。PRD 已基于真实 `appAssistantPanel.js` parser、`assistantExecutionOrchestrator.cancel()` 和 UI 测试边界修复：`取消任务/暂停任务/继续任务/取消全部任务` 这类缺少作用对象的表达当时不会被本地控制 parser 命中，不能在 PRD 中写成“已支持自然语言取消任务”；该缺口已由 Slice 188-193 补成首轮澄清、短回答/按钮执行、卡片完成/禁用态和 latest-message 历史恢复最小闭环，剩余的是复杂多轮语义与复杂澄清队列管理。
- Slice 188 为运行时 + PRD 修复切片：已用 TDD 补齐 broad task-control 首轮歧义确认；`取消任务/暂停任务/继续任务` 在缺模型配置时仍可发送，但只返回“当前任务还是排队任务”的澄清，`response.executionControl.action` 为 `clarify`、`requestedAction` 为 `cancel/pause/resume`、`status` 为 `needs_clarification`，不调用 `api.chat/chatStream`，也不修改 active/queued 状态；同时修正 queue hint，避免 `暂停任务` 被误判为队列暂停，保留 `继续暂停的任务` 的 queue resume 行为。本轮未启动、检查、探测或访问 `8777`。
- Slice 189 为运行时 + PRD 修复切片：已用 TDD 补齐澄清后的二次短回答执行；state 保存 `pendingExecutionControlClarification`，下一条 `当前任务` 会复用原请求执行 active control，下一条 `排队任务` 会复用原请求执行 queue control。Focused UI 测试覆盖 `取消任务 -> 当前任务` 调用 active cancel 且不误伤 queued，以及 `暂停任务 -> 排队任务` 暂停第一个 queued 并同步 `queue-control`；两条路径都不调用 LLM。本轮未启动、检查、探测或访问 `8777`。
- Slice 190 为运行时 + PRD 修复切片：已用 TDD 补齐澄清卡片按钮；`取消任务/暂停任务/继续任务` 的澄清回复会附带 `当前任务/排队任务` 两个按钮，按钮点击后调用 `state.sendMessage("当前任务"|"排队任务")`，复用 Slice 189 pending clarification 执行路径。Focused UI 测试覆盖 current 按钮取消 active、queue 按钮暂停 queued，均不调用 LLM。本轮未启动、检查、探测或访问 `8777`。
- Slice 191 为纯文档复核切片：本轮未改运行时代码、未触碰 `8777`；CodeGraph MCP 当前返回未初始化，且 `.codegraph` 目录中仍有 `codegraph.db` 与 `codegraph.db.lock`，因此按项目规则降级为 `rg`/定向读取。PRD 当时已修正到 v3.50，明确 Slice 190 澄清按钮是已完成最小闭环；Slice 192 又补齐卡片完成/禁用态最小闭环；Slice 193 又补齐 latest-message 澄清上下文历史恢复最小闭环；Slice 194 又补齐 completed card 本地持久回写最小闭环；Slice 195 又补齐旧未决澄清自动归档最小闭环；跨设备/后端消息更新和复杂多轮语义仍未完成。
- Slice 192 为运行时修复切片：已用 TDD 补齐澄清卡片完成/禁用态；点击 `当前任务/排队任务` 后，最近 `execution_control_clarification` card 会变为 `completed`、两个按钮 disabled，被选按钮写入 `data-selected="true"`，重复点击不会再次执行同一卡片。
- Slice 193 为运行时 + PRD 修复切片：已用 TDD 补齐 latest-message 澄清上下文历史恢复；`executionControlClarificationCard()` 会写入 `action/all/activeExecutionId/queueCount`，`applyNaturalLanguageAmbiguousExecutionControl()` 会把同一 card 写入 `conversationStore.appendMessage()`，`restoreConversation()` 会通过 `pendingExecutionControlClarificationFromMessages()` 从最后一条 `needs_clarification` card 重建 pending clarification，因此恢复会话后用户只说 `当前任务/排队任务` 仍能继续执行。该闭环在 Slice 193 时不等于 completed card 本地持久回写、跨设备/后端消息更新或复杂多轮语义完成。
- Slice 194 为运行时 + PRD 修复切片：已用 TDD 补齐 completed card 本地持久回写；`assistantConversationStore.updateMessageCard()` 可按 card id 更新已保存消息 card，`completeExecutionControlClarificationCard()` 在内存 card completed 后会 best-effort 回写本地 conversationStore。该闭环不等于跨设备/后端消息更新或复杂多轮语义完成。
- Slice 195 为运行时 + PRD 修复切片：已用 TDD 补齐多个未决澄清自动归档；`archivePendingExecutionControlClarificationCards()` 会把旧 `needs_clarification` card 标记为 `archived` 并 best-effort 回写 conversationStore，`renderInteractionCard()` 对 archived/completed 等非待澄清卡片禁用按钮；新 broad 澄清、明确当前/排队任务控制或普通对话继续前都会清理旧 pending。该闭环不等于跨设备/后端消息更新、复杂多轮语义、复杂局部批量交换/全量重排或 Undo/Replay 完成；其中完整序数列表全量重排已由 Slice 197 补成最小闭环。
- Slice 196 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列指定位置重排；`parseQueueMoveCommand()` 会识别包含 source/target 序数的移动表达，`assistantExecutionStore.moveQueuedExecutionToIndex()` 会在 mixed queued/queued_draft 队列中移动目标并保持其它项相对顺序，`assistantExecutionApiClient.controlQueuedExecution(...,{targetIndex})`、`CanvasAgentExecutionService.control_queued_execution(..., target_index=...)` 与 `/queue-control` route 支持 `action:"move"` 的 best-effort 同步。该闭环不等于复杂局部批量交换、完整序数列表全量重排、拖拽计划板联动、复杂多轮语义或 Undo/Replay 完成；其中完整序数列表全量重排已由 Slice 197 补齐最小闭环。
- Slice 197 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列全量重排最小闭环；`queueControlOrderIndexes()` / `parseQueueReorderCommand()` 会识别完整序数列表，`assistantExecutionStore.reorderQueuedExecutions()` 会按 `orderedIds` 重排 queued/queued_draft 并保留 active/status，`assistantExecutionApiClient.controlQueuedExecution(...,{orderedIds})`、`CanvasAgentExecutionService.control_queued_execution(..., ordered_ids=...)` 与 `/queue-control` route 支持 `action:"reorder"` 的 best-effort 同步。该闭环不等于复杂局部批量交换、多轮指代式重排、拖拽/可编辑计划板联动、DAG/prepare 重编译联动或 Undo/Replay 完成；其中两个明确序数交换已由 Slice 198 补齐最小闭环。
- Slice 198 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列两项交换最小闭环；`parseQueueSwapCommand()` 会识别 `交换/互换/对调/换一下/换个位置/swap` 且需要两个明确排队序数，生成完整 `orderedIds` 后复用 `assistantExecutionStore.reorderQueuedExecutions()` 和后端 `action:"reorder"` 同步。Focused UI 测试覆盖 `把第二个和第四个排队任务换一下` 绕过 LLM、保留 active/status，并同步 `{ orderedIds:[...] }`。该闭环不等于三项及以上局部换位、多轮指代式重排、拖拽/可编辑计划板联动、DAG/prepare 重编译联动或 Undo/Replay 完成；其中受控三项局部句式已由 Slice 199 补齐首片。
- Slice 199 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列三项局部重排首片；`parseQueueSwapThenMoveLastCommand()` 会识别 `把第二个和第四个排队任务换一下，再把第三个排到最后` 这类句式，先交换前两个序数，再把第三个序数对应的原队列项移动到队尾，生成完整 `orderedIds` 并复用后端 `action:"reorder"` 同步。Focused UI 测试先复现旧错误 `[1,3,2,4]`，再验证目标 `[1,4,2,3]`、绕过 LLM、保留 active/status。该闭环不等于任意多步骤局部重排、多轮指代式重排、拖拽/可编辑计划板联动、DAG/prepare 重编译联动或 Undo/Replay 完成。
- Slice 200 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列“先移动到最后，再按当前位置交换”受控句式；`parseQueueMoveLastThenCurrentSwapCommand()` 会识别 `先把第三个排到最后，再把当前第二个和当前第四个换一下`，先移动第一个序数对应的原队列项到队尾，再按移动后的当前位置交换第二个与最后一个序数，生成完整 `orderedIds` 并复用后端 `action:"reorder"` 同步。Focused UI 测试先复现旧错误 `[1,3,2,4]`，再验证目标 `[1,3,4,2]`、绕过 LLM、保留 active/status。该闭环不等于任意多步骤局部重排泛化、多轮指代式重排、拖拽/可编辑计划板联动、DAG/prepare 重编译联动或 Undo/Replay 完成。
- Slice 201 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列 operation plan mini-interpreter 首片；`queueControlOperationSegments()` 会按 `先/再/然后/接着/随后/then/next` 切分句段，`parseQueueOperationPlanCommand()` 会将每段解析为 swap 或 move operation，并按当前队列顺序逐步执行生成完整 `orderedIds`，优先于旧的单句式 parser 命中。Focused UI 测试覆盖 `先把第一个和第三个排队任务换一下，再把当前第四个移动到第二个，然后把当前第三个和当前第四个换一下`，验证目标 `[3,4,1,2]`、绕过 LLM、保留 active/status 并同步后端 `action:"reorder"`。该闭环不等于完整任意自然语言队列编辑、多轮指代式重排、拖拽/可编辑计划板联动、DAG/prepare 重编译联动或 Undo/Replay 完成。
- Slice 202 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列“前两个/后两个”相邻引用首片；`queueControlAdjacentSwapIndexes()` 会把 swap 段中的 `前两个/最前两个/前两项/最前两项/firsttwo` 映射到当前队列 `[0,1]`，把 `后两个/最后两个/末尾两个/后两项/最后两项/lasttwo` 映射到当前队尾相邻两项。Focused UI 测试覆盖 `先把第一个和第三个排队任务换一下，再把前两个换一下`，验证目标 `[2,3,1,4]`、绕过 LLM、保留 active/status 并同步后端 `action:"reorder"`。该闭环不等于完整任意自然语言队列编辑、多轮指代式重排、标题/类型/内容等非序数任务引用、拖拽/可编辑计划板联动、DAG/prepare 重编译联动或 Undo/Replay 完成。
- Slice 203 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列标题关键词引用首片；`parseQueueTitleMoveCommand()` 会让 `把海报生成移动到第三个排队任务` 按 queued title/line1 唯一命中 `exec-queued-2`，移动到 `targetIndex:2`，绕过 LLM、保留 active/status，并同步后端 `action:"move"`。该闭环不等于标题歧义选择、多轮指代、类型/内容语义引用、拖拽计划板联动、DAG/prepare 重编译联动或 Undo/Replay 完成。
- Slice 204 为纯文档复核切片：本轮未改运行时代码、未触碰 `8777`；CodeGraph 默认调用返回未初始化、显式 `projectPath` 返回 `database is locked`，因此按真实代码定向读取修复 PRD 到 v3.64。已把顶部状态、真实代码锚点、Phase 2/3 进度和自检结论统一到当时真实边界：Plan Board 仍只读，Timeline 仍无 Undo/Replay，标题关键词引用只支持唯一命中，标题歧义选择、多轮指代、类型/内容引用、拖拽计划板联动、完整历史入口和真实 live 联调仍未完成；其中标题歧义本地文字澄清已由 Slice 205 补成首片。
- Slice 205 为运行时 + PRD 修复切片：已用 TDD 补齐标题关键词引用歧义澄清首片；`queueControlTitleReferenceMatch()` 会在多个 queued execution 的 `title/drawerState.line1` 同分命中时返回 `ambiguous:true` 与候选，`parseQueueTitleMoveCommand()` 会返回 `queueControl.action="clarify"`、`status="needs_clarification"`、`requestedAction="move"`、`targetIndex` 与候选列表，`applyNaturalLanguageQueueControl()` 会在模型 guard/API/LLM 前追加本地澄清回复。Focused UI 测试覆盖 `把海报生成移动到第三个排队任务` 同时命中 `海报生成 A/B` 时不调用 LLM、不移动队列、不调用后端同步且回复列出候选。候选按钮/短回答执行已由 Slice 206 补成最小闭环；类型/内容语义引用、多轮指代、拖拽计划板联动、DAG/prepare 重编译联动或 Undo/Replay 仍未完成。
- Slice 206 为运行时 + PRD 修复切片：已用 TDD 补齐标题歧义候选短回答/按钮执行最小闭环；`queue_title_clarification` 卡片会在澄清时渲染候选按钮，`parsePendingQueueTitleClarification()` 支持 `第二个`、`2`、候选标题与候选 id，`applyPendingQueueTitleClarification()` 会完成卡片并复用本地 `move` 队列控制，最终同步后端 `controlQueuedExecution(id, "move", { targetIndex })`。Focused UI 测试覆盖短回答和按钮两条路径，相关 JS 回归 `165 pass / 0 fail`。该闭环仍不等于完整自然语言队列语义调度器；类型/内容引用、多轮指代、拖拽计划板联动、跨设备消息更新、真实 `8777` live 联调和 Undo/Replay 仍未完成。
- Slice 207 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列生成类型语义引用首片；`queueControlSemanticReferenceMatch()` 在 title/line1 未唯一命中时读取 queued execution 的 `actionsByStep`，识别 `图片/图像/image`、`视频/video`、`文本/文字/text` 对应的生成动作类型。唯一命中时复用本地 `move` 队列控制；多个同类型命中时复用 Slice 206 候选澄清与短回答执行。Focused UI 测试覆盖唯一图片生成任务直接移动和两个图片生成任务先澄清再执行，相关 JS 回归 `167 pass / 0 fail`。该闭环仍不等于完整语义调度器；内容/主题/资产引用、多轮指代、拖拽计划板联动、跨设备消息更新、真实 `8777` live 联调和 Undo/Replay 仍未完成。
- Slice 208 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列 prompt/content 内容语义引用首片；`queueControlContentReferenceHint()` 会从用户的 source reference 中抽取内容线索并去掉泛词，`queueControlExecutionContentCandidates()` 会从 queued `actionsByStep` 收集 action 本体 `prompt/text/content/description/summary`、`data.prompt/text/content/description/summary`、`payload.prompt/text/content/description`、`params.prompt/text/content/description`，当前不读取 `payload.summary/params.summary`；`queueControlContentReferenceMatch()` 做规范化子串匹配，`queueControlSemanticReferenceMatch()` 在无生成类型或类型未命中时回退到内容匹配。唯一命中时复用本地 `move` 队列控制；多个内容候选命中时复用 Slice 206 候选澄清与短回答/按钮执行。Focused UI 测试覆盖 `把猫咪海报那个排队任务移动到最后` 直接移动，以及两个 `猫咪海报` prompt 先澄清再执行；相关 JS 回归 `169 pass / 0 fail`。该闭环仍不等于完整语义调度器；资产级引用、多轮指代、复杂主题相似度检索、拖拽计划板联动、跨设备消息更新、真实 `8777` live 联调和 Undo/Replay 仍未完成。
- Slice 209 为运行时 + PRD 修复切片：已用 TDD 补齐自然语言队列资产字段级语义引用首片；`queueControlAssetCandidateValues()` 会从 action、`data`、`payload`、`params` 直接抽取 `assetId/assetName/assetTitle/assetLabel/assetKey/assetItem*`，并从嵌套 `asset/assetItem/referenceAsset` 与资产数组中抽取 `id/name/title/label/assetId/assetName/assetTitle`；`queueControlExecutionAssetCandidates()` 汇总 queued `actionsByStep` 的资产候选；`queueControlAssetReferenceMatch()` 做规范化子串匹配；`queueControlSemanticReferenceMatch()` 在无生成类型或类型未命中时先尝试资产字段匹配，再回退到 prompt/content。唯一命中时复用本地 `move` 队列控制；多个资产候选命中时复用 Slice 206 候选澄清与短回答/按钮执行。Focused UI 测试覆盖 `把新资产4那个排队任务移动到最后` 直接移动，以及两个 `新资产4` 资产候选先澄清再执行；focused `asset reference` 为 `92 pass / 0 fail`。该闭环仍不等于完整语义调度器；多轮指代、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、拖拽计划板联动、跨设备消息更新、真实 `8777` live 联调和 Undo/Replay 仍未完成。
- Slice 210 为纯 PRD 复核修复切片：基于 `appAssistantPanel.js` 与 `appAssistantPanel.p1Ui.test.js` 的真实代码把 PRD 修复到 v3.70；修正 Slice 208 `payload/params` 字段误写，细化 Slice 209 资产字段候选范围，保留 Plan Board 只读、Timeline 无 Undo/Replay、自然语言队列编辑非完整语义调度器、真实 `8777` live 联调未做等边界。本切片不新增运行时代码。
- Slice 211 为运行时 + PRD 修复切片：已用 TDD 补齐最近一次命中任务的代词指代首片；`state.lastQueueControlReference` 会在明确队列控制成功后记录 execution id，`parseQueueRecentReferenceMoveCommand()` 会让纯 `它/刚才那个/that` 来源的 move 命令复用该 execution id，并继续走本地 `move` + 后端 `queue-control` best-effort 同步。Focused UI 测试覆盖 `把新资产4那个排队任务移动到最后` 后再说 `把它移动到第一个排队任务`，验证同一个 `exec-queued-asset-4` 被移动、绕过 LLM、保留 active/status。该闭环仍不等于完整多轮语义记忆；不同会话/跨设备/后端消息同步 recent reference、复杂“它旁边/它后面的那个/刚才那两个”、复杂主题相似度、资产库搜索、拖拽计划板联动、真实 `8777` live 联调和 Undo/Replay 仍未完成。
- Slice 212 为运行时 + PRD 修复切片：已用 TDD 补齐最近队列引用的本地会话恢复首片；`assistantConversationStore.appendMessage()` 现在保存 `kind/queueControl/executionControl`，`cloneMessage()` 保留这些控制 metadata，`queueControlReferenceFromMessages()` 会从历史 assistant message 的 `queueControl.executionId/title` 恢复最近引用，`restoreConversation()` 会重建 `state.lastQueueControlReference`。Focused UI 测试覆盖先用 `把新资产4那个排队任务移动到最后` 命中并持久化，再用新 state 恢复同一本地 conversation 后说 `把它移动到第一个排队任务`，仍绕过 LLM 命中 `exec-queued-asset-4` 并同步后端 `move`；相关回归 `173 pass / 0 fail`。该闭环不等于跨设备/后端消息同步、不同话题长期记忆、复杂“它旁边/它后面的那个/刚才那两个”、资产库搜索、真实 `8777` live 联调或 Undo/Replay 完成。
- Slice 213 为运行时 + PRD 修复切片：已用 TDD 补齐最近队列引用相邻项指代首片；`queueControlRecentNeighborOffset()` 会从 move 动词前的 source 中识别 `它/刚才那个` 加 `前面/前一个/上一个/后面/后一个/下一个/previous/next`，`parseQueueRecentReferenceMoveCommand()` 会把它解析到最近 referenced queued execution 的相邻项，并复用本地 `move` + 后端 `queue-control` 同步。Focused UI 测试覆盖 `把它前面的那个移动到第一个排队任务`，验证命中 `exec-queued-asset-5`、绕过 LLM、保留 active/status，并写入 `referenceSource:"recent_queue_neighbor"`。该闭环仍不等于 `刚才那两个`、连续多次相邻跳转、复杂主题相似度、资产库搜索、真实 `8777` live 联调或 Undo/Replay 完成。
- Slice 214 为运行时 + PRD 修复切片：已用 TDD 补齐 `它旁边那个` 的左右歧义澄清首片；`queueControlRecentAmbiguousNeighborSource()` 识别 recent reference + `旁边/附近/nearby/neighbor`，`queueControlRecentNeighborCandidates()` 从当前队列取最近引用项前后相邻候选，`parseQueueRecentReferenceMoveCommand()` 在候选超过一个时返回 `clarify/needs_clarification`，不移动队列、不调用后端同步、不调用 LLM。Focused UI 测试覆盖先把 recent item 移到队列中间，再说 `把它旁边那个移动到第一个排队任务`，验证候选为前后两个 queued execution，targetIndex 为 0，队列保持不变。该闭环仍不等于 `刚才那两个`、连续多次相邻跳转、澄清后的复杂语义链、复杂主题相似度、资产库搜索、真实 `8777` live 联调或 Undo/Replay 完成。
- Slice 215 为纯 PRD 复核修复切片：本轮未改运行时代码、未触碰 `8777`；CodeGraph 仍返回 `database is locked`，因此降级用 `rg`/定向读取核验真实代码。已新增第 2.6 节，修复 `它旁边那个` 的 Slice 214 归属、最近引用记忆边界、方案 B 抽屉真实状态、Timeline Undo/Replay 未完成边界和 8777 人工协作约束。
- Slice 216 为运行时 + PRD 修复切片：已用 TDD 补齐 `它旁边那个` 澄清后的前/后 relation 短答执行首片；`queueControlRecentNeighborCandidates()` 会给候选写入 `relation:"previous"|"next"`，`normalizeQueueTitleClarificationCandidates()` 会保留 relation，`queueTitleClarificationRelationAnswer()` 识别 `前面的/后面的/上一个/下一个/previous/next`，`parsePendingQueueTitleClarification()` 在 relation 唯一命中时选择候选并复用本地 `move` + 后端 `queue-control` 同步。Focused UI 测试覆盖 `后面的` 命中最近引用后方 queued execution；相关回归 `176 pass / 0 fail`。该闭环仍不等于 `刚才那两个`、连续多次相邻跳转、不同会话/跨设备 recent reference、资产库搜索、真实 `8777` live 联调或 Undo/Replay 完成。
- Slice 217 为纯 PRD 复核修复切片：本轮未改运行时代码、未触碰 `8777`；CodeGraph 默认调用返回未初始化，显式 `projectPath` 返回 `database is locked`，因此降级用 `rg`/定向读取核验真实代码。已把 Slice 216 的 relation 短答执行同步补入方案 B 差异表、9.10 队列规则、Phase 2/3 状态、队列状态机和自检结论，避免接力开发误判为仍停在 Slice 214 的“只澄清不执行”。
- Slice 218 为运行时 + PRD 修复切片：已用 TDD 补齐同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动首片；`rememberQueueControlReference()` 维护最近 4 个本地队列控制引用，`parseQueueRecentMultiReferenceMoveCommand()` 识别 `刚才那两个/这两个/both/those two`，取最近两个不同 queued execution，并按当前队列顺序生成完整 `orderedIds` 走本地 `reorder` + 后端 `queue-control` best-effort 同步。Focused UI 测试覆盖先命中 `新资产4`，再用 `它前面的那个` 命中第二个队列项，随后 `把刚才那两个移动到最后` 绕过 LLM、保留 active/status、把两项整体移到队尾；focused `recent two queue references` 为 `98 pass / 0 fail`，相关回归 `177 pass / 0 fail`。该闭环仍不等于跨会话/跨设备 recent reference、无明确数量的“刚才那几个/那一组”多对象、连续多次相邻跳转、复杂主题相似度、资产库搜索、真实 `8777` live 联调或 Undo/Replay 完成。
- Slice 219 为运行时 + PRD 修复切片：已用 TDD 补齐同一本地 conversation restore 后最近两个队列引用重建首片；`queueControlReferencesFromMessages()` 会按历史 assistant message 的 `queueControl.executionId/executionIds` 顺序重建最近 4 个本地队列控制引用，`queueControlReferenceFromMessages()` 返回 `recentExecutionIds`，`restoreConversation()` 用该列表恢复 `state.recentQueueControlReferences`。Focused UI 测试覆盖先命中 `新资产4`，再用 `它前面的那个` 命中第二个队列项，保存 conversation 后新建 state 并 restore，随后 `把刚才那两个移动到最后` 继续绕过 LLM、保留 active/status、把两项整体移到队尾；focused `restored conversation reuses recent two queue references` 为 `99 pass / 0 fail`。该闭环仍不等于不同 conversation、跨设备/后端消息同步 recent reference、无明确数量的“刚才那几个/那一组”多对象、连续多次相邻跳转、复杂主题相似度、资产库搜索、真实 `8777` live 联调或 Undo/Replay 完成。
- 已明确方案 B，并纳入用户 2026-06-10 最新交互要求：计划板和时间线是输入框上方独立执行抽屉，不是底部大抽屉。
- 已明确抽屉位置：贴着输入框，收起态像输入框的一部分，展开态原地向上覆盖聊天区。
- 已明确默认抽屉内容：第一行任务名 + 进度 + 队列数量，第二行最新状态。
- 已明确滚动规则：执行中日志持续追加并自动滚到底部；用户手动滚动后暂停 5 秒再回到底部。
- 已明确按钮规则：右下角水平排列，展开按钮常驻，第二按钮按状态显示确认、授权视频、暂停、继续或重试，无需求时隐藏。
- 已明确确认规则：默认抽屉可直接确认最近待确认项；视频按钮必须写“授权视频”；多个待确认项一次只确认当前最近一项。
- 已明确目标多任务规则：执行中新输入全部排队；默认只显示当前任务和队列数量；展开态顶部显示完整任务队列横条；当前 v2 response 主链路已接入最小入队与完成后自动拉起，Slice 169-180 已补 Orchestrator 注入式 prepare hook、fail-closed、默认 app latest context API boundary、主浏览器 API prepare 暴露、后端 `/prepare` thin boundary、默认 server prepare runner wiring 和 `queued_draft` 防陈旧执行；旧 actions 兼容流和真实 8777 live 联调仍需补齐。
- 已明确目标队列规则：超过 5 个只提示队列较长，仍允许加入；置顶不打断当前任务；暂停适用于当前任务和排队任务；当前已完成首个非暂停 queued/queued_draft 任务自动拉起、queue warning、展开态队列控制、后端 `queue-control` 同步、Orchestrator prepare hook、prepare fail-closed、默认 app latest context API boundary、主浏览器 API prepare 暴露、后端 `/prepare` thin boundary、默认 server runner、`queued_draft` 最小状态机，以及自然语言单项队列控制、`取消全部排队任务`、当前任务暂停/继续、当前任务取消、broad 命令首轮歧义确认、澄清后短回答执行、澄清按钮执行、澄清卡片完成/禁用态、latest-message 澄清历史恢复、completed card 本地持久回写、旧澄清自动归档、指定位置移动、完整序数列表全量重排、两项交换、两类受控三项局部重排、多步骤 operation plan 首片、前两个/后两个相邻引用、标题关键词唯一命中移动、标题关键词歧义本地澄清、标题歧义候选按钮/短回答执行、生成类型语义引用、prompt/content 内容语义引用、资产字段级语义引用、最近一次命中任务代词指代和同一本地会话 restore 后 recent reference 恢复、最近引用前/后相邻项指代、`它旁边那个` 左右歧义澄清最小闭环、澄清后 `前面的/后面的` relation 短答执行首片、同一本地会话最近两个明确队列控制对象的 `刚才那两个` 成组移动首片、同一本地 conversation restore 后最近两个引用重建首片、同一本地会话最近三个明确队列控制对象的 `刚才那三个` 成组移动首片；完整任意自然语言队列编辑、连续多次相邻跳转、无明确数量的“刚才那几个/那一组”多对象、不同会话/跨设备/后端消息同步 recent reference、复杂主题相似度检索、资产库全量搜索/同名资产深度消歧、拖拽计划板联动、跨设备/后端消息更新、真实 8777 live 联调和失败/视频/依赖联动尚未实现。
- 已明确展开态布局：顶部任务队列横条，左侧计划区，右侧时间线/详情区。
- 已明确当前真实 UI 边界：队列卡片已有最小控制，计划区、时间线详情仍是最小只读形态，计划编辑/DAG/开发者详情尚未实现。
- 已明确计划编辑规则：Plan 模式确认前可编辑；Act 模式必须暂停后才能编辑未执行步骤。
- 已明确目标完成总结规则：保留最近一次任务总结，可手动关闭；关闭后聊天历史和项目级 AI 执行历史可找回；同时已标注真实代码尚未提供关闭按钮和完整历史浏览入口。
- 已明确第一版不做完整可视化 Skill Studio，不做 mini canvas 自由编辑，不自动删除生成资产。
