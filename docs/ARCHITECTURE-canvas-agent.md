# 幻映智能体 Canvas Agent 产品架构总览

> v3.90 起新增导演决策层（QMAI Director Brain，带外文件桥）：
> 用户「导演：」命令 → 面板(6 道本地闸门后路由) → POST /director/plan →
> director_bridge_service(每请求 node 进程) → tools/director_plan_runner.mjs(L3 编译,
> 只读 QMAI 记忆+连续性门) → v2 合同(matchedSkills=["director"]) → 既有执行工作台。
> 回流：GET /receipts → huanying-execution-receipts/v1 文件桥 → QMAI 审片记忆飞轮。
> 三红线：画布即真相 / 生成必确认 / QMAI 只读。

> 对应 PRD v3.90（docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md）。
> 所有图中模块均为真实代码，验证状态见末尾测试矩阵。

## 1. 分层总架构

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                浏  览  器（真实 Chromium）                            │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │                         幻映工作台前端（静态 ES Modules）                          │ │
│ │                                                                                 │ │
│ │  ┌─────────────┐   ┌──────────────────────────────────────────────────────────┐ │ │
│ │  │  画布运行时   │   │           助手面板 appAssistantPanel.js (~7k 行)          │ │ │
│ │  │ graphStore   │◀──┤ ┌──────────┐ ┌──────────────┐ ┌──────────────────────┐  │ │ │
│ │  │ (appStore)   │   │ │ 聊天/输入  │ │ 模型选择菜单   │ │  执行抽屉(输入框上方)   │  │ │ │
│ │  │ deleteNodes  │   │ │ sendMsg   │ │ =文本节点规则  │ │ 收起态/展开态/队列横条  │  │ │ │
│ │  │ renameNode   │   │ │ NL队列控制 │ │ failed可选    │ │ 计划区(启停/拖拽/DAG)  │  │ │ │
│ │  │ updateNode.. │   │ └────┬─────┘ └──────────────┘ │ 时间线(重试/跳过/撤销/  │  │ │ │
│ │  └──────▲──────┘   │      │                        │  撤销到这里/重新生成)    │  │ │ │
│ │         │           │      │                        │ 详情(开发者JSON/指标)   │  │ │ │
│ │   graph 适配器       │      │                        │ 历史(搜索/chips/分页)   │  │ │ │
│ │  (autoload.js:      │      ▼                        └──────────▲───────────┘  │ │ │
│ │   removeNode/       │ ┌─────────────────────────────┐          │              │ │ │
│ │   removeEdge/       │ │ assistantExecutionOrchestrator│─────────┘              │ │ │
│ │   updateNode)       │ │ run/pause/resume/cancel/retry │                        │ │ │
│ │                     │ │ skip/undo/undoTo/replay/      │   ┌──────────────────┐ │ │ │
│ │                     │ │ regenerateStep/prepare hook   │──▶│assistantExecution │ │ │ │
│ │                     │ │ 跨action别名表/技能约束携带     │   │Store(localStorage)│ │ │ │
│ │                     │ └──────────┬───────────────────┘   │ 队列/时间线/inverse│ │ │ │
│ │                     │            │ executeActions        │ /matchedSkills/   │ │ │ │
│ │                     │            ▼                       │ 跨重启安全暂停      │ │ │ │
│ │                     │ ┌──────────────────────────────┐   └────────┬─────────┘ │ │ │
│ │                     │ │ assistantActionExecutor       │            │ 尽力同步   │ │ │
│ │                     │ │ + canvasSkillsRuntime(生成桥) │            ▼           │ │ │
│ │                     │ └──────────────────────────────┘  assistantExecutionApi │ │ │
│ │                     │ ┌──────────────────────────────┐  Client(fetchMetrics/  │ │ │
│ │                     │ │ assistantExecutionMetrics     │  upsert/timeline/     │ │ │
│ │                     │ │ (PRD第20章指标本地派生)        │  status/queue-control/ │ │ │
│ │                     │ └──────────────────────────────┘  prepare)              │ │ │
│ └─────────────────────┴───────────────────────┬─────────────────────────────────┘ │ │
└─────────────────────────────────────────────── │ ────────────────────────────────────┘
                                  HTTP /api/v2/* │
┌─────────────────────────────────────────────── ▼ ────────────────────────────────────┐
│                         本地服务 server.py（端口 8777，python）                        │
│ ┌──────────────────┐  ┌─────────────────────────┐  ┌───────────────────────────────┐ │
│ │HttpRouteDispatcher│─▶│ CanvasAgentRouteService  │─▶│ CanvasAgentExecutionService    │ │
│ │ allowlist:        │  │ chat / chat/stream       │  │ 项目级 execution 持久化         │ │
│ │ executions* /     │  │ actions/validate(技能门) │  │ compute_metrics() 聚合          │ │
│ │ metrics / status  │  │ conversations / metrics  │  │ queue-control / prepare        │ │
│ │ / sync 等         │  │ model→provider 路由      │  │ 跨重启 executing→paused        │ │
│ └──────────────────┘  └─────┬──────────┬────────┘  └───────────────────────────────┘ │
│                             │          │                                              │
│           ┌─────────────────▼──┐  ┌────▼──────────────────┐  ┌─────────────────────┐ │
│           │ CanvasAgentAction   │  │ PI_BRIDGE_SERVICE      │  │ ClawSkillRegistry    │ │
│           │ Schema 校验          │  │ subprocess.run → node  │  │ Service(v2 loader +  │ │
│           │ + matched_skills    │  │ (每请求新进程)          │  │ 语义触发匹配)         │ │
│           │   allowed/forbidden │  └────┬──────────────────┘  └─────────────────────┘ │
│           └─────────────────────┘       │                                              │
└──────────────────────────────────────── │ ─────────────────────────────────────────────┘
                                          ▼
                      ┌──────────────────────────────────────────┐
                      │   PI Canvas Agent 运行时（node, TS/JS双维护）│
                      │ piClient: v2合同包装/栅栏JSON剥离/          │
                      │   matchedSkills本地触发回填(语义匹配)       │
                      │ huanyingTools: v2技能加载(triggers/        │
                      │   qualityChecks保留) + 注册表Prompt         │
                      │ piSdkAdapter ──▶ OpenAI兼容网关             │
                      │   (modelRegistry: gemini-3.1-pro@grsai等)  │
                      └──────────────────────────────────────────┘
```

## 2. 一次"用户指令 → 画布行动"的完整时序

```
用户          面板              PI桥(后端)      LLM网关        Orchestrator      Executor/画布     ExecutionStore     后端Store
 │  输入消息    │                  │               │               │                 │                │               │
 ├────────────▶│ NL队列控制?──是──▶ 本地拦截(不进LLM)               │                 │                │               │
 │             │ 否                │               │               │                 │                │               │
 │             ├── chat/stream ──▶│ 加载v2技能+系统提示词           │                 │                │               │
 │             │                  ├── 请求模型 ───▶│               │                 │                │               │
 │             │                  │◀── 文本(可能带```栅栏) ────────┤                 │                │               │
 │             │                  │ 剥栅栏→解析→v2合同包装          │                 │                │               │
 │             │                  │ matchedSkills本地触发回填       │                 │                │               │
 │             │◀── v2响应(intent/plan/actionsByStep) ─────────────┤                 │                │               │
 │             │ recordExecution(matchedSkills持久化) ────────────────────────────────────────────────▶│── 尽力同步 ──▶│
 │  抽屉显示    │◀─ 计划/确认按钮 ──┤               │               │                 │                │               │
 ├─ 点击确认 ──▶│                  │               │               │                 │                │               │
 │             ├──── run(executionId) ────────────────────────────▶│                 │                │               │
 │             │                  │               │               │ 逐action:        │                │               │
 │             │                  │◀─ validate(+matchedSkills) ───┤ 技能约束门(fail-closed)            │               │
 │             │                  │               │               ├── execute ─────▶│ 创建/连线/排队生成│               │
 │             │                  │               │               │ 别名表收集/重写   │                │               │
 │             │                  │               │               ├ completed事件(耗时/target/inverse) ▶│── 同步 ─────▶│
 │  时间线滚动  │◀──────────────── 渲染 ────────────────────────────┤                 │                │               │
 │             │                  │               │               │ 完成→自动拉起队列(prepare重编译)     │               │
```

## 3. 执行/队列状态机

```
                       ┌──────────┐  入队(已有active)   ┌──────────────┐
  v2响应 ─────────────▶│  draft   │───────────────────▶│ queued_draft  │
                       └────┬─────┘                    └──────┬───────┘
                       确认/Act │            置顶/暂停/取消/重排 │ 轮到执行→prepare(最新画布重编译)
                            ▼                                ▼  fail-closed: prepare_failed→failed
                       ┌──────────┐    暂停请求         ┌──────────┐
        ┌─────────────▶│executing │◀──────resume───────│  paused  │◀── 跨重启恢复(executing遗留)
        │              └─┬──┬──┬──┘                    └──────────┘
        │     视频未授权 │  │  │ 取消(当前action后)
        │              ▼  │  ▼
        │  ┌────────────────┐ ┌───────────┐    重试(cursor/单action)
        │  │waiting_video_  │ │ cancelled │         │
        │  │authorization   │ └───────────┘         │
        │  └──────┬─────────┘                       │
        │   授权视频│            校验失败/执行失败      │
        └─────────┘        ┌──────────┐◀────────────┘
                           │  failed  │── blocked_by_skill(不可重试) / dependency_blocked(下游暂停)
                           └────┬─────┘
                                │ 全部完成
                           ┌────▼─────┐  关闭→ visible=false → 执行历史(搜索/chips/分页)找回
                           │completed │── 回放结构(replay) / 重新生成此步(regenerateStep)
                           └──────────┘
```

## 4. 时间线事件与 Undo 体系

| 事件状态 | 产生者 | 关键字段 | 可操作 |
|---|---|---|---|
| running / completed / failed | run() 逐 action | durationMs(真实)、target{actionType,nodeType,nodeIds,stepId}、inverse、developer.actionJson/result | 重试此步 / 跳过此步 / 撤销此步 / 撤销到这里 |
| blocked_by_skill | 技能约束门 | developer.validation | 不可重试（fail-closed） |
| dependency_blocked | 依赖失败/跳过 | blockedBy{Event,Action,Step}Id | 源事件显示"后续N步依赖" |
| waiting_video_authorization | 视频安全门 | actionJson | 授权视频 |
| undone / undo_conflict / undo_failed | undo()/undoTo() | undoneFromEventId、removed/restoredNodeIds、conflicts | — |
| replayed / replay_skipped_generation | replay() | replay:true | 结构重放，生成跳过 |
| prepared / prepare_failed | 队列prepare | prepareErrorKind 四类 | 重试 |
| restored_paused | 跨重启恢复 | restoreReason | 继续 |

```
Inverse op 类型           捕获时机                     撤销语义              冲突保护
─────────────────────────────────────────────────────────────────────────────────
remove_node            create_node 成功后           删除AI创建节点         创建时签名比对(name/data)
remove_edge            connect_nodes 成功后         删除AI创建边           边存在性
restore_node           update_node* 执行前快照       恢复 name/data         执行后签名比对
restore_node_position  layout/move 执行前位置        恢复 x/y               位置签名
(生成动作)              不捕获                       不可撤销(资产保留)      —
```

## 5. Unified Skill Registry 三链路

```
                    config/assistant-skills-v2/<id>/{skill.json, instructions.md, examples.json, tests.json}
                    字段: triggers / allowedActions / forbiddenActions / qualityRules / qualityChecks
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        ▼                         ▼                          ▼
  Claw 链路                  PI 链路(真实聊天主链路)        Canvas Skills 链路
  ClawSkillRegistry          huanyingTools 加载+注入        canvasSkillIdsForV2Skill
  语义触发匹配(镜像规则)       piClient matchedSkills回填     映射到稳定 Canvas skill id
        │                         │                          │
        └────────────┬────────────┘                          │
                     ▼                                       ▼
        执行期强制: orchestrator validate 携带 matchedSkills ──▶ 后端 ActionSchema
        按 allowed/forbidden 拦截 → blocked_by_skill 事件 fail-closed
                     │
        离线质检: offline runner = 命中断言 + 约束一致性 + qualityChecks(requires/forbids/maxActions)
```

语义触发匹配规则（PI TS/JS 与 Claw Python 同构镜像）：
1. 归一化子串命中；2. 多词触发词→全部非停用词在场；3. CJK 触发词(≥4字)→前后半段都在场。

## 6. HTTP API 面（/api/v2/canvas-agent/*）

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | /chat, /chat/stream | LLM 对话（model 引用路由到 modelRegistry 配置，含未测试模型） |
| POST | /actions/validate | 动作校验 + matchedSkills 技能约束门 |
| GET | /status | 运行时状态 |
| GET | /metrics?projectId= | 后端指标聚合（第20章） |
| GET/POST | /executions | 列表（projectId/status 过滤）/ upsert |
| GET | /executions/{id} | 单条 |
| POST | /executions/{id}/timeline | 追加时间线事件（含 inverse/target 持久化+脱敏） |
| PATCH | /executions/{id}/status | 状态/plan/drawerState 合并 |
| PATCH | /executions/{id}/queue-control | top/pause/resume/cancel/move/reorder |
| POST | /executions/{id}/prepare | queued_draft 最新画布重编译（默认 runner=PI chat） |
| DELETE | /executions?status=completed | 清理已完成 |
| GET/POST | /conversations*, /generation-tasks*, /sync/project | 会话/生成任务/项目同步 |

## 7. 成功指标（PRD 第20章）实现状态

| 指标 | 度量实现 | 最近 live 实测 |
|---|---|---|
| Skill 命中准确率 | skillHitRate（前端派生+后端聚合） | 1.0（gemini 真实链路） |
| action 合法率 | actionValidityRate | 1.0 |
| 失败可恢复率 | failureRecoveryRate | 有数据即出 |
| execution 可找回率 | executionFindabilityRate + 历史搜索/chips/分页 | 1.0 |
| 未授权视频生成 | 多层安全门（前端/预览/CanvasSkill/Orchestrator/regenerate） | 0 起 |
| 平均动作耗时 | avgActionDurationMs（真实计时） | 4-8ms（结构动作） |
| 三链路一致性 | 同一 skill 定义 + 同构触发匹配 | 离线 runner 12/12 |
| 满意度/投诉类 | 不可本地度量（需用户反馈通道） | — |

## 8. 测试与验证矩阵

| 层 | 套件 | 数量 | 性质 |
|---|---|---|---|
| 前端单元/UI | modules/app + modules/assistant + canvasSkills + PI integration | 533 pass | node --test，fake DOM |
| 后端单元 | execution/route/schema/dispatcher/runner/claw-registry | 6 套全 OK | unittest |
| 技能离线质检 | tools/run_assistant_skill_v2_offline_tests.py | 12 cases | 命中+约束+qualityChecks |
| live UI 验收 | tools/run_canvas_agent_ui_acceptance.mjs | 17 项 | 真实 Chromium + 真实 8777 |
| live LLM E2E | tools/run_canvas_agent_llm_e2e.mjs | 8 项 | 真实 gemini→画布全链路 |
| live 图片生成 E2E | tools/run_canvas_agent_image_e2e.mjs | 5 项 | 真实 ai-image 排队+启动 |

## 9. 已知边界（v3.89）

- Orchestrator 执行路径不回写 `state.generationTasks`（生成任务跟踪/通知在抽屉确认路径缺失）——下一优先级。
- qualityChecks 仅作用于 examples 静态质检，不在运行时执行链强制。
- 触发匹配是规则式语义（非向量/同义词表）。
- 指标为快照级聚合，无历史趋势与独立仪表页。
- DAG 为只读 ASCII 分层图，非交互图形。
- Replay 不重建生成结果（4.2 设计决定）；regenerateStep 不恢复跨原执行的节点别名。
