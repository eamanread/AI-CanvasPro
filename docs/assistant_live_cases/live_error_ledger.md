# Assistant Live Error Ledger

Purpose: every live assistant failure must become a traceable repair item. Do not rely on memory or chat history when debugging real model output.

Service rule:

- The developer must not start, stop, restart, status-check, or probe the user-managed `8777` service.
- If a backend or frontend reload is required, ask the user to do it manually.
- Continue live smoke only after the user says the service is ready.

## Error Classification

| Class | Meaning | Policy |
| --- | --- | --- |
| A | Safe equivalent shape that can be repaired | Repair in schema/executor, add warning, add regression test |
| B | Ambiguous or permission-sensitive request | Ask for clarification or confirmation, do not execute blindly |
| C | Unsafe or forbidden behavior | Hard fail, record diagnostics, never auto-repair |

## Entries

### 2026-05-29 STV-LIVE-001

Date: 2026-05-29

User input:

```text
做一个15秒雨夜赛博追逐故事短片，先生成故事大纲、风格设定、分镜文本、关键图和视频准备节点
```

Service state:

- User manually restarted `8777` before the live smoke.
- Developer did not start, stop, restart, status-check, or manage `8777`.

Returned state:

- The model output was directionally correct.
- It prepared 5 video nodes.
- It did not trigger video generation.
- It warned that video generation needs explicit authorization.
- Backend schema rejected the action batch.

Raw errors:

```text
action[0] missing required field nodeIds
action[45] unsupported layout storyboard_grid
```

Classification:

- `missing nodeIds` on empty workflow `create_group`: Class A.
- `storyboard_grid` unsupported layout strategy: Class A.

Root cause:

- Real model emitted an empty `create_group` placeholder before the workflow nodes.
- Prompt/skill declared `storyboard_grid`, but schema safe layout list did not yet include it.

Repair files:

- `services/claw_action_schema.py`
- `claw_action_schema_test.py`

Regression tests:

- `ClawActionSchemaTests.test_validate_allows_story_to_video_storyboard_grid_layout`
- `ClawActionSchemaTests.test_validate_ignores_empty_create_group_placeholder_in_story_workflow`

Expected policy after repair:

- Workflow-scoped empty `create_group` placeholders may be ignored with warning.
- Standalone empty `create_group` must still fail.
- `storyboard_grid` is a safe layout strategy.

Verification recorded in handoff:

```powershell
python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_allows_story_to_video_storyboard_grid_layout
python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_ignores_empty_create_group_placeholder_in_story_workflow
```

Need user restart:

- Yes. The running `8777` process must be manually restarted by the user before this backend schema repair can affect live service behavior.

Current status:

- Repair documented from previous implementation.
- Current workspace source tree does not contain the referenced Claw source files, only `__pycache__` entries. Restore the Claw source files before modifying or rerunning these regression tests.

## New Entry Template

```text
Date:
Case id:
User input:
Service manually restarted by user: yes/no
Developer avoided start/stop/restart/status/probe of 8777: yes/no
Returned success:
Error code:
Raw error:
Original actions summary:
Class A/B/C:
Root cause:
Repair file:
Regression test name:
Verification command:
Need user restart:
Current status:
```
