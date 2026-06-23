# Claw Assistant Browser Acceptance Script

Date: 2026-05-30

Purpose: verify that a successful `/api/v2/assistant/chat` response becomes a usable canvas experience. Passing backend schema is not enough.

Service collaboration rule:

- The developer must not start, stop, restart, status-check, or probe the user-managed `8777` service.
- When this script needs a fresh backend/frontend load, the user manually prepares or restarts the service.
- The developer continues only after the user says the service is ready.

## Acceptance Preparation

Tester preparation:

```text
1. User manually starts or restarts 8777.
2. Open the app in the browser.
3. Refresh the page so current frontend assets are loaded.
4. Open the assistant panel named 幻映智能体.
5. Use an empty canvas for the first run.
6. Keep browser console open for errors.
```

Developer preparation:

```text
1. Do not manage 8777.
2. Keep docs/assistant_live_cases/story_to_video_cases.md open.
3. Record every failure in docs/assistant_live_cases/live_error_ledger.md.
4. If a failure maps to schema, preview, executor, panel, or prompt, write a regression test before changing code.
```

Automated runner preparation:

```text
Before asking the user to confirm 8777, developers may run tools/run_canvas_agent_r5_regression.ps1 -PreflightOnly.
The -PreflightOnly mode runs only offline/preflight gates, prints preflightResults to the console, and returns before live fixture journeys.
The -PreflightOnly mode must not browser-test, manage, status-check, or probe 8777.
Use tools/run_canvas_agent_r5_regression.ps1 only after the user confirms 8777 is ready.
The runner must complete the P0-P4 completion audit and P4 platform regression before any live browser fixture journey.
If the P0-P4 completion audit, Pi offline regression, or P4 platform regression fails, stop before browser automation and fix the offline blocker first.
Each produced artifact bundle is checked with tools/assistant_live_artifact_validator.mjs for required screenshots, passing R5 scorecard, summary links, and secret safety.
Each accepted artifact also includes p0-p4-live-artifact-provenance.json with preflightResults, proving it was produced by the P0-P4 R5 wrapper after the frontend/backend, P0-P4 audit, Pi offline, and P4 platform preflights.
The runner is still not allowed to start, stop, restart, status-check, or probe 8777.
```

## Primary Story-To-Video Acceptance Run

Input:

```text
做一个15秒雨夜赛博追逐故事短片，先生成故事大纲、风格设定、分镜文本、关键图和视频准备节点
```

Expected chat result:

```text
The assistant responds normally.
No raw schema stack trace appears to the user.
If there are warnings, they are short and understandable.
```

Expected preview:

```text
故事视频工作流：将创建 X 个节点，连接 Y 条线。
文本/图片生成将自动执行 N 个任务。视频生成仍需确认。
```

Preview must not say:

```text
普通工作流
未知工作流
已经生成视频
视频已开始生成
```

Expected canvas nodes:

```text
1 story outline ai-text node
1 style bible ai-text node
At least 3 shot script ai-text nodes
At least 3 shot keyframe ai-image nodes
At least 3 shot video prep ai-video nodes
```

Expected layout:

```text
Story outline and style bible are on the left.
Shots are ordered by shotIndex.
Each shot flows text -> keyframe -> video prep.
Nodes do not overlap.
New nodes are not stacked at (0, 0).
Viewport focuses on the new story workflow or makes it easy to find.
```

Expected generation state:

```text
Text nodes may enter queued/running generation state.
Image nodes may enter queued/running generation state.
Video nodes remain prepared/idle.
No video task starts until the user explicitly authorizes video generation.
```

Expected receipt:

```text
Created story video workflow.
Mentions node count and connection count.
Mentions text/image generation.
Mentions video still requires confirmation.
```

Expected history:

```text
recentOperations contains one batch-level operation for the workflow.
Undo removes the created workflow batch or reverses the batch changes.
User can ask "刚刚做了什么" and the assistant can answer from recent operation memory.
```

## Selected Asset Acceptance Run

Preparation:

```text
1. Add or select one image asset node.
2. Name or identify it as 小狐狸角色参考.
3. Confirm it is selected on canvas.
```

Input:

```text
用我选中的角色素材做一个30秒温暖儿童绘本故事视频，拆成分镜文本、关键图和视频准备节点
```

Expected:

```text
The assistant acknowledges or uses the selected asset context.
The style bible references the selected character.
Keyframe prompts preserve character identity.
If selection context is unavailable, assistant asks for clarification instead of inventing an asset.
Video generation remains gated.
```

## Existing Storyboard Acceptance Run

Preparation:

```text
1. Place an existing ai-text node named 故事大纲.
2. Optionally place two existing shot script nodes.
3. Select or make them visible in canvas context.
```

Input:

```text
把当前画布里的故事大纲扩展成45秒悬疑短片，按镜头补齐关键图和视频准备节点
```

Expected:

```text
Existing user content is not deleted or overwritten.
Assistant reuses or references existing story context when safe.
If ownership or ambiguity is unclear, assistant asks for confirmation.
Workflow completes to about 9 shots.
Video generation remains gated.
```

## Error UI Acceptance

For any failure:

```text
Success hints are small, light gray text.
Error hints are small red text.
Errors longer than three lines are collapsed by default.
The user can expand details with an arrow.
Every assistant message has a copy button.
Message text is selectable and copyable.
User messages keep the subtle bubble style.
Assistant messages and receipts do not use heavy bubble cards.
```

## Screenshot Requirements For Failures

Capture:

```text
1. Assistant input and latest response.
2. Preview block.
3. Canvas viewport showing nodes or missing nodes.
4. Browser console if it contains errors.
5. Network response only if available without exposing secrets.
```

Never capture:

```text
API keys
tokens
secret config values
full local private paths if not needed for debugging
```

## Regression Record Template

```text
Date:
Acceptance run:
User confirmed 8777 ready:
Input:
Chat success:
Preview pass:
Canvas node structure pass:
Layout pass:
Text/image generation pass:
Video authorization boundary pass:
Receipt/history pass:
Undo pass:
Error UI pass:
Screenshots:
Failure class:
Regression test added:
Fix file:
Need user restart:
```
