# Story-To-Video Live Golden Cases

Date: 2026-05-30

Purpose: these cases are the fixed live targets for the Huanying assistant `story_to_video` workflow. They define what the model should produce before any browser or live service acceptance run.

Core contract:

- Produce exactly 1 story outline `ai-text` node.
- Produce exactly 1 style and character continuity `ai-text` node.
- Produce multiple shot script `ai-text` nodes.
- Produce 1 keyframe `ai-image` node for each shot.
- Produce 1 video prep `ai-video` node for each shot.
- Text and image generation may auto-run.
- Video generation must not auto-run without explicit user authorization.
- Every shot-level node should carry `workflowKind=story_to_video`, a shared `workflowGroupId`, `shotIndex`, and `shotDurationSec`.

## Case STV-15-CYBER-EMPTY

User input:

```text
做一个15秒雨夜赛博追逐故事短片，先生成故事大纲、风格设定、分镜文本、关键图和视频准备节点
```

Canvas context:

- Empty canvas.
- Suggested origin may be used when available.
- Project preference: 16:9, 15 seconds, cinematic cyberpunk rain night.

Expected structure:

- 1 story outline node.
- 1 style bible node.
- 5 shot script nodes.
- 5 shot keyframe nodes.
- 5 shot video prep nodes.
- Shot duration target: 3 seconds each.
- Layout should use `storyboard_grid` or another safe storyboard layout strategy.

Must not happen:

- No `queue_generation_task` for `ai-video`.
- No automatic video generation.
- No nodes stacked at `(0, 0)`.
- No standalone empty `create_group` failure.

Acceptance notes:

- Text and image tasks can be queued automatically.
- Video prep nodes should be visible and clearly waiting for authorization.

## Case STV-30-CHILDREN-SELECTED-ASSET

User input:

```text
用我选中的角色素材做一个30秒温暖儿童绘本故事视频，拆成分镜文本、关键图和视频准备节点
```

Canvas context:

- Existing selected image asset node named `小狐狸角色参考`.
- Project preference: 16:9, 30 seconds, soft picture-book style.

Expected structure:

- 1 story outline node.
- 1 style bible node referencing the selected character asset.
- 6 shot script nodes.
- 6 shot keyframe nodes.
- 6 shot video prep nodes.
- Shot duration target: 5 seconds each.
- Each keyframe prompt should preserve the selected character identity.

Must not happen:

- No video generation without explicit authorization.
- No claim that the assistant cannot access selected canvas context if the selected asset is present in context.
- No duplicate story outline per shot.
- No duplicate style bible per shot.

Acceptance notes:

- If the selected asset cannot be resolved, the assistant should ask for clarification instead of fabricating the asset.

## Case STV-20-ENGLISH-STYLE-MIXED

User input:

```text
做一个20秒孤独宇航员回家的故事短片，画面风格用英文提示词 cinematic realistic, soft rim light, deep space
```

Canvas context:

- Empty canvas or normal existing canvas.
- User explicitly provides English visual style fragments.

Expected structure:

- 1 story outline node.
- 1 style bible node preserving the English style fragments.
- 4 shot script nodes.
- 4 shot keyframe nodes.
- 4 shot video prep nodes.
- Shot duration target: 5 seconds each.

Must not happen:

- No conversion into a single `text_to_image_video` chain.
- No removal of the user-provided English style fragments.
- No automatic video generation.

Acceptance notes:

- The outline and shot script can be Chinese.
- The image/video prompts may include the English visual style fragments when useful.

## Case STV-45-EXISTING-STORYBOARD

User input:

```text
把当前画布里的故事大纲扩展成45秒悬疑短片，按镜头补齐关键图和视频准备节点
```

Canvas context:

- Existing `ai-text` node named `故事大纲`.
- Existing partial storyboard may contain 2 shot script nodes.

Expected structure:

- Reuse or reference the existing story outline when safe.
- Create or update 1 style bible node.
- Complete the storyboard to 9 total shot script nodes.
- Create missing keyframe and video prep nodes for each shot.
- Shot duration target: 5 seconds each.

Must not happen:

- No deletion or overwrite of existing user nodes without confirmation.
- No duplicate full storyboard if existing shot nodes can be identified.
- No automatic video generation.

Acceptance notes:

- If existing shot ownership is ambiguous, the assistant should create a confirmation request instead of destructive edits.

## Manual Live Result Template

Use this template after every manual `8777` live smoke. The developer must not start, stop, restart, status-check, or probe `8777`; the user prepares the service.

```text
Date:
Case id:
User confirmed service restarted: yes/no
Chat success:
Action count:
Story outline nodes:
Style bible nodes:
Shot script nodes:
Shot keyframe nodes:
Shot video prep nodes:
Unauthorized video queue: yes/no
Schema warnings:
Validation errors:
Browser apply result:
Notes:
```
