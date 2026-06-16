# Claw Code Assistant E2E Regression Checklist

Last updated: 2026-05-26

This checklist is the C26 handoff artifact for validating the ideal Claw Code assistant product path. It separates offline automation from live/manual checks so future developers can keep moving without accidentally touching the user-managed service.

## Non-Negotiable Service Rule

- 用户负责启动/重启/确认 8777。
- 开发者不启动、不重启、不停止、不检查、不探测 8777。
- If a live check needs the running service, stop and ask the user to prepare it, then continue only after the user says it is ready.
- Backend changes need a user-managed `8777` restart before live effect. Frontend static JS changes need a browser refresh.

## Offline Automated Regression

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1
```

To inspect the local-only command list without running it:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1 -List
```

The script is offline-only. It runs backend tests, frontend tests, Python syntax checks, JS syntax checks, and `git diff --check`. It does not call Claw, OpenAI, LLM Wiki, a browser, cloud generation, or the `8777` service.

## Coverage Map

| Scenario | Automated coverage | Manual live check |
| --- | --- | --- |
| C26-ASSET-RESTORE / 拿资产 | Asset context, restore action schema, preview, executor, auto-apply, and late AssetManager tests. | Ask the assistant to take the currently visible/selected asset from the asset panel and place it on the canvas. It must use a real asset action, not fabricate a generic node. |
| C26-CONNECT-VIDEO / 连接视频节点 | Connection port semantic tests, executor handle preservation tests, and schema friendly diagnostics. | Ask it to connect image/text/video/audio sources to the right video node handles. Wrong handles should produce a readable recovery message. |
| C26-CREATE-IMAGE / 创建图像节点 | `create_node`, `connect_nodes`, `queue_generation_task`, preview, executor, and auto-apply tests. | Ask it to create an image generation node from a text prompt/source node and queue image generation. Text/image generation may apply directly because it is internal local orchestration. |
| C26-WORKFLOW-CLEANUP / 整理工作流 | `move_nodes`, `layout_nodes`, `duplicate_nodes`, `create_group`, transaction rollback, and history commit tests. | Ask it to organize selected nodes horizontally/grid, duplicate a small workflow, and group selected nodes. One assistant batch should behave as one product operation. |
| C26-MULTI-TOPIC-MEMORY / 多话题记忆 | Conversation create/list/detail, rename/search/export/delete, summary, recent messages, and operation memory tests. | Create two topics, switch between them, close/reopen or refresh, and verify each topic keeps its own context without mixing. |
| C26-PROJECT-PREFERENCES / 项目偏好 | Project preference memory, schema, prompt protocol, route injection, and update/clear tests. | Tell the assistant to remember a project style/aspect ratio/model preference, start a new topic, and verify the preference is still considered. |
| C26-LLM-WIKI-LANDING / LLM Wiki | Read-only wiki status/search/context, canvas action hints, source-scope guard, citation metadata, preview, node display, and receipt tests. | With LLM Wiki configured, ask for knowledge cards to land on canvas. Cards must cite real current search results and not invent source metadata. |
| C26-CONTEXT-DEBUG / 上下文调试 | `/context/preview` debug summary, API wrapper, and panel context debug button tests. | Click the debug control before a model turn. The summary should show context bytes, canvas/assets/selection counts, action protocol, compaction, and warnings without secrets. |
| C26-NATIVE-SESSIONS / nativeSessions | Runtime status and launch spec tests verify `one_shot_json_prompt` plus conservative native resume capability reporting. | Open assistant status/debug information. It should make clear native resume is not the active chat bridge and Huanying memory is canonical. |
| C26-VIDEO-AUTHORIZATION / 视频生成授权 | Video queue schema, bridge normalization, preview risk copy, executor confirmation guard, and auto-apply exclusion tests. | Ask it to queue video generation. It must show confirmation/risk first and only write local queued state after user authorization. |
| C27-TOPIC-MANAGEMENT / 话题管理 | Panel and autoload tests cover topic search, rename, export, and delete helpers. | Open the topic drawer, search an existing topic, rename it, export it, delete it after confirmation, and verify the remaining topic stays isolated. |
| C27-QUICK-INTENTS / 快捷意图 | Panel tests cover quick intent buttons that prepare common prompts for assets, cleanup, image generation, and LLM Wiki cards. | Click the quick intent buttons and verify they prepare useful Chinese prompts without immediately triggering paid or risky work. |
| S2-CANVAS-DOCTOR / 画布医生 | Bridge protocol, context diagnostics, schema metadata, preview, focus, and panel receipt tests cover diagnosis, annotation, severe-issue focus, and doctor-layout receipt wording. | Ask “检查这个画布有什么问题”. It should identify concrete issues, optionally leave removable comment/source-text annotations, and focus the most important problem nodes. |
| S2-AUTO-LAYOUT / 自动整理画布 | `canvas.layoutHints`, typed layout strategies, layout/move/group executor tests, and receipt tests cover safe tidy-up without prompt/model/asset/generation edits. | Ask “帮我整理一下画布”. It should use layout/move/group/focus/viewport-style actions, keep generation settings untouched, and summarize `诊断后整理` when combined with diagnosis. |
| S3-WORKFLOW-MVP / 一句话搭工作流 | `workflowMvpRules`, workflow metadata schema, context preservation, preview paid-boundary copy, executor workflow node/group tracking, and panel/autoload receipt tests cover structure-only workflow creation. | Ask “帮我搭一个文生图生视频工作流”. It should create and connect `source-text -> ai-image -> ai-video`, lay out/focus the new workflow, not call `queue_generation_task` or `run_prompt_preset_generation`, and undo the whole batch as one operation. |
| S4-STORYBOARD-DIRECTOR / 分镜导演 | Current frontend coverage includes storyboard metadata context preservation, multi-shot executor grouping/layout, preview shot summaries, panel receipts, and the no-unauthorized-video boundary. Backend `storyboardRules` and schema metadata whitelist coverage are still required before this row can be considered complete. | After S4 A/B/C are complete, ask it to split a short script into 3-8 shots. It should create ordered storyboard groups with title, visual, camera, style, and image prompt metadata, prepare video nodes only, and not auto-run unauthorized video generation. |

## Manual Live Pass Criteria

Only start these after the user says `8777` is ready and the browser has been refreshed if frontend static JS changed.

1. The assistant can chat through the configured OpenAI-compatible provider and returns Chinese answers without dropping project context.
2. The assistant can inspect current canvas/selection/assets/workflows through sanitized context.
3. Low-risk internal actions apply directly: asset restore, image/text generation queueing, layout, move, duplicate, group, focus, and safe node updates.
4. Risky or paid actions stay gated: video generation requires explicit user authorization.
5. Invalid actions fail safely with Chinese recovery suggestions and do not leave partial canvas mutations.
6. Persistent memory works across refresh/reopen: topics, recent messages, operation summaries, and project preferences remain available.
7. Topic management is visible: users can search, rename, export, and delete assistant topics from the panel.
8. 快捷意图 are visible and prepare common prompts for asset restore, selection cleanup, image creation, and LLM Wiki cards.
9. Context debug explains bad model behavior quickly: if an asset or wiki source is missing, the debug summary should reveal whether it was absent from context.
10. Native Claw session status is transparent: `nativeSessions` should report the current bridge as `one_shot_json_prompt`, not falsely claim real resumed REPL chat.
11. 画布医生 live flow is understandable: diagnosis annotations, focus, and tidy-up summaries should use diagnostic language, not generic create/layout wording.
12. 自动整理 live flow is safe: it may move, layout, group, rename, focus, or change viewport, but it must not edit prompt/model/assets/generation fields or trigger generation.
13. 一句话工作流 live flow is safe: “搭一个文生图生视频工作流” should create the `source-text -> ai-image -> ai-video` structure, explain the paid-generation boundary in preview/receipt, and leave actual generation unrun until the user explicitly asks.
14. 分镜导演 live flow is safe only after S4 A/B/C land: “把这段脚本拆成分镜” should create 3-8 ordered shot groups with reusable image prompts, keep continuity metadata, and require explicit authorization before any video generation.

## Handoff Notes

- This file is a regression contract, not an implementation plan.
- When a future slice adds a new assistant capability, update both this checklist and `scripts/claw_assistant_regression.ps1` if it creates a new stable test file or changes the broad suite.
- After every completed slice, update `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`, `task_plan.md`, `progress.md`, and `findings.md`.
