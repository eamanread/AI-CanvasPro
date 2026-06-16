# Roadmap Completion Plan (Slices 251-255)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD per task, one commit per task. PRD/handoff update once at the end (v3.89).

**Goal:** Finish the five remaining roadmap items: backend metrics aggregation + dashboard UI, real image-generation live E2E, graphical DAG + history status chips, machine-checkable qualityChecks, semantic trigger matching.

### Task 1 (Slice 251): backend metrics aggregation + dev dashboard
- Python: `CanvasAgentExecutionService.compute_metrics(filters)` mirroring `assistantExecutionMetrics.computeExecutionMetrics`; route `GET /api/v2/canvas-agent/metrics` (+ dispatcher GET allowlist); tests in `canvas_agent_execution_service_test.py` + `canvas_agent_route_service_test.py` + `http_route_dispatcher_test.py`.
- Frontend: in developer mode, drawer detail shows `.hy-canvas-agent-execution-metrics` block with local metrics lines (命中率/合法率/恢复率/平均耗时/找回率), plus best-effort backend aggregate via new `assistantExecutionApiClient.fetchMetrics()`; p1Ui test.

### Task 2 (Slice 252): graphical DAG + history status chips
- DAG: replace edge list with leveled ASCII graph in `<pre class="hy-canvas-agent-execution-dag-graph">` (topological levels, `└─▶` connectors); keep `.hy-canvas-agent-execution-dag-edge` rows for a11y/text. p1Ui test asserts levels + connectors.
- History chips: `.hy-canvas-agent-execution-history-chip` buttons (全部/已完成/失败/已取消) filtering the list before pagination; p1Ui test.

### Task 3 (Slice 253): machine-checkable qualityChecks
- skill.json gains optional `qualityChecks: [{type: requiresActionType|forbidsActionType|maxActions, action?, value?}]`; offline runner enforces them against examples.json; add sensible checks to the 4 built-in skills; loader (huanyingTools ts+js) keeps `qualityChecks`; runner tests RED→GREEN; built-ins must pass.

### Task 4 (Slice 254): semantic trigger matching
- Rule: normalized substring OR (multi-word trigger: all words present) OR (CJK trigger len>=4: both halves present). Implement in piClient ts+js `matchedSkillIdsForMessage` and Python `ClawSkillRegistryService` matcher for three-chain consistency; tests both sides (e.g. 帮我把画布整理一下 hits canvas_layout).

### Task 5 (Slice 255): real image-generation live E2E
- New `tools/run_canvas_agent_image_e2e.mjs`: real UI drive, message asks 1 分镜 + 1 张关键帧图片生成; confirm; assert queue_generation_task completed event + queuedGenerationNodeIds non-empty + generation task visible in store/backend; time-boxed waits; self-cleaning. Run against real 8777.

### Task 6: full regression, PRD v3.89, handoff record 229, commits; then produce the full architecture document (ASCII diagrams + tables) and save to docs/ARCHITECTURE-canvas-agent.md.
