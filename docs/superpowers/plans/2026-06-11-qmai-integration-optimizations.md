# QMAI Integration Optimizations Plan (Slices 256-262)

> REQUIRED SUB-SKILL: superpowers:executing-plans. TDD per slice, one commit per slice. PRD v3.90 + handoff at the end. Three red lines never break: 画布即真相 / 生成必确认 / QMAI 只读 (writeBackAllowed=false, paths redacted).

Covers the full review backlog: 冗余 5 项 + 错配 4 项 + 做得更好 6 项.

### Slice 256 — 共享净化模块（冗余#5a）
Create `modules/assistant/sensitiveDataRules.js` exporting `isSensitiveKey(key)`, `looksLikeLocalPath(value)`, `redactSensitiveText(value)` as the single rule source (union of assistantProtocol + directorContextSchema rules). Both `assistantProtocol.js` and `modules/directorBrain/directorContextSchema.js` import it. RED: divergence cases (director sanitizer must now redact `Bearer x` strings; protocol must catch keys only director caught). Existing tests must stay green.

### Slice 257 — director 技能注册（做得更好#2/#4，冗余#1 服务端保险）
`config/assistant-skills-v2/director/`: skill.json (allowed: create_node/connect_nodes/layout_nodes/focus_nodes/create_group/update_node_data/rename_node; forbidden: queue_generation_task/start_generation/run_prompt_preset_generation/delete_nodes/write_file/shell_command; triggers: 导演/director/QMAI/铺分镜/导演计划; qualityRules + qualityChecks requiresActionType create_node + forbidsActionType queue_generation_task + maxActions 60), instructions.md, examples.json, tests.json. Offline runner passes.

### Slice 258 — 第一刀接线：director intent → 编译 → v2 → 工作台（错配#4，做得更好#1/#3，冗余#2 删中间 PI）
- `tools/director_plan_runner.mjs` (node, has fs): stdin JSON {qmaiProjectPath?, message?} → env HY_QMAI_PROJECT_DIR fallback → loadDirectorMemoryExport-derived knowledgeCards (entries top 6 → {id,title,source:{shortQuote}}), optional export-dir artifacts (storyboard.json / action-package.json / continuity-report.json if present) → buildDirectorBrainCanvasPlan → stdout v2 contract: intent{id:"director_plan",mode:"act",matchedSkills:["director"]}, plan steps [step_cards, step_shots, step_layout(dependsOn step_shots)] with actions bucketed, requiresConfirmation=status==="warn", warnings from blocked reasons, execution{status:"draft", drawerState visible}.
- `services/director_bridge_service.py`: subprocess.run node runner (mirror pi_bridge: temp payload via stdin, timeout, fail-closed error envelope).
- Route `POST /api/v2/canvas-agent/director/plan` + dispatcher POST allowlist + `api/canvasAgentApi.js directorPlan()`.
- Panel: in `sendMessage` AFTER the 6 local gates: `/^(导演|director)[:：]/` → `api.directorPlan({message})` → append assistant message + `recordAssistantExecutionFromResponse` (drawer/queue/undo all reuse). NO path persisted client-side (red line). Tests: runner unit (fixture dir), python bridge test, route test, dispatcher test, p1Ui test (director command renders drawer with plan; queue-control phrases still intercepted first).

### Slice 259 — prepare 分流（冗余#4 合并重编译）
Panel default prepareQueuedExecution: if `execution.matchedSkills?.includes("director")` and `api.directorPlan` → `api.directorPlan({recompile:true})`, return {plan, actionsByStep, drawerState.line2:"导演已按最新记忆重新编排"}; else existing fresh-context path. Fail-closed semantics unchanged. p1Ui test with queued director execution.

### Slice 260 — 回执导出投影（错配#2，做得更好#5 飞轮通道）
Backend `export_receipts(filters)` → {schemaVersion:"huanying-execution-receipts/v1", generatedAt, metrics, executions:[{id,title,status,matchedSkills,undoneCount,timeline:[{status,durationMs,error}]}]} sanitized; `GET /api/v2/canvas-agent/receipts` (+dispatcher GET allowlist); `tools/export_execution_receipts.py --out <file>` for the symmetric file bridge to QMAI. Python TDD.

### Slice 261 — golden fixture 契约测试（做得更好#6）
Commit `modules/directorBrain/__fixtures__/qmai-live-sample/` (live wiki/memory layout: project-meta.json + character-states.md + timeline.md + canon-facts.md) + golden test asserting loadDirectorMemoryExport normalized output exactly; protects the cross-repo contract without QMAI repo access. (QMAI 仓库自身的 commit/push 收尾属于另一会话，不在本仓动。)

### Slice 262 — live 验收 + 文档
Restart 8777 (python changes). Live: director skill blocks generation via /actions/validate; POST director/plan with fixture dir returns v2; `tools/run_canvas_agent_director_e2e.mjs`: 真实 UI 发「导演：按 QMAI 项目铺一版分镜」→ 抽屉 → 确认 → 知识卡节点真实落画布（HY_QMAI_PROJECT_DIR=fixture）。PRD v3.90 + handoff 230 + ARCHITECTURE doc 增补 director 层。

不切（明确排除）：PI 双角色拆分、QMAI HTTP 服务化、QMAI 仓库内的任何改动。
