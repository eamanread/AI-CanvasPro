# Generation Confirmation Rework Plan (Slices 263-267)

> REQUIRED SUB-SKILL: superpowers:executing-plans. TDD per slice, one commit per slice.

User-locked spec (7 Socratic answers):
- Confirmation ONLY for real generation dispatch actions (queue_generation_task / run_prompt_preset_generation, nodeType-resolved); blank node creation never gates/counts.
- Plan mode: confirm when image OR video generation present; otherwise auto-execute (incl. text-only generation).
- Act mode: confirm only when video generation present.
- One up-front confirmation releases the whole plan; clicking 确认 IS video authorization (APPLY strong-confirm retired).
- Copy: 本次将生成 X 个文本节点、X 个图片节点、X 个视频节点，确认执行吗？ (omit zero counts; text count informational only).
- Drawer's other states (progress/failed/completed/queue) unchanged; confirmation state gets a redesigned look (main line + per-type count badges + highlighted confirm); fix line1==line2 duplication bug.
- Both paths (v2 drawer + legacy chat pendingActions card) follow the same rule.

### Slice 263 — counting + gating helpers (pure TDD)
`modules/assistant/assistantGenerationConfirmation.js`: `countGenerationActions(actions, graphStore)` -> {text,image,video}; `generationConfirmationRequired(counts, agentMode)`; `generationConfirmationMessage(counts)` (zero-omit copy). Reuse nodeType inference semantics from executor (nodeType/targetNodeType/data.nodeType + graphStore lookup).

### Slice 264 — v2 drawer path
- recordAssistantExecutionFromResponse: compute counts from v2 actions; if no confirmation required and orchestrator runnable -> auto `orchestrator.run(execution.id, {agentMode, videoAuthorized:false})` (status executing), drawer shows progress not confirm; if required -> execution stays draft with `drawerState.confirm = {message, counts}`.
- drawerActionLabel: 确认 only when confirm required (draft/waiting_confirmation/waiting_video_authorization with generation pending); 授权视频 label retired -> unified 确认 (message covers video counts).
- handleExecutionDrawerAction 确认: one step — pass `videoAuthorized:true` when video count>0 (no approveVideoGeneration/APPLY); red line preserved because unconfirmed video plans never auto-run.
- line1/line2 dedupe: when line1===line2, line2 becomes status text.

### Slice 265 — legacy pendingActions path + APPLY retirement
- After response with legacy pendingActions: counts -> not required => auto handleApply(); required => preview card stays with new copy; Apply passes videoAuthorized:true (covers video) one-step.
- strongConfirmButton / APPLY flow retired (hidden, logic short-circuited); update affected tests.

### Slice 266 — confirmation visual redesign
Drawer confirm state: `data-confirm="true"`, main line = generationConfirmationMessage, badges `.hy-canvas-agent-confirm-badge` per nonzero type, highlighted 确认 button; CSS added to panel stylesheet.

### Slice 267 — E2E updates + live acceptance + docs
- Update tools/run_canvas_agent_llm_e2e.mjs (text storyboard in Act -> auto-executes, no confirm click), run_canvas_agent_director_e2e.mjs (structural -> auto), image E2E (Act image -> auto; Plan image -> confirm card with counts).
- Live on 8777; PRD v3.91 + handoff 231.
