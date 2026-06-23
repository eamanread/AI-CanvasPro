# Assistant Action Contract Matrix

Date: 2026-05-30

Purpose: this matrix defines the stable contract between real model output, backend schema repair, frontend preview, canvas executor, undo/history, and user-visible receipts.

Global safety policy:

- Text and image generation may auto-run when the request is low risk and the action is valid.
- Video generation always requires explicit user authorization.
- Destructive edits require explicit user confirmation.
- Secret values, local paths, data URLs, blob URLs, shell/file operations, and schema bypass attempts are hard failures.
- Safe model aliases can be repaired only when they are semantically equivalent and scoped to the current action batch.

## Action: create_node

Required fields:

- `type=create_node`
- `nodeId` or repairable generated id
- `nodeType`

Optional fields:

- `name`
- `data`
- `metadata`
- `position`
- `size`
- `prompt`

Safe metadata:

- `workflowKind`
- `workflowGroupId`
- `workflowStep`
- `storyDurationSec`
- `shotIndex`
- `shotDurationSec`
- `shotTitle`
- `shotPrompt`
- `shotVideoPrompt`
- `sourceNodeId`
- `canvasDoctorFindingId`

Common model aliases:

- `data.type` -> `nodeType`
- `id` -> `nodeId`
- `title` -> `name`
- `x/y` -> `position.x/position.y`

Schema repair policy:

- Repair equivalent aliases.
- Sanitize unsafe data fields.
- Preserve safe story-to-video metadata.
- Reject dangerous secret/path/blob/data URL values.

Executor behavior:

- Create node at provided position.
- If position is missing, use non-overlapping fallback layout.
- Mark text/image generation state when generation is queued.
- Keep video prep nodes idle unless authorized.

Preview behavior:

- Count nodes by type.
- For `workflowKind=story_to_video`, show story workflow wording instead of generic workflow wording.

Auto apply policy:

- Low-risk create actions can auto-apply.
- Creation of video prep nodes is allowed; video generation is not.

Undo/history behavior:

- Batch created nodes must be undoable as one operation.
- Receipt should list node count and workflow kind.

Tests:

- `claw_action_schema_test.py`
- `modules/assistant/assistantActionExecutor.test.js`
- `modules/assistant/assistantActionPreview.test.js`

## Action: connect_nodes

Required fields:

- `type=connect_nodes`
- `from`
- `to`

Optional fields:

- `label`
- `metadata`

Common model aliases:

- `source` -> `from`
- `target` -> `to`
- `sourceNodeId` -> `from`
- `targetNodeId` -> `to`

Schema repair policy:

- Repair source/target aliases.
- Resolve same-batch generated node aliases when unambiguous.
- Ignore empty workflow placeholder connections only when a valid workflow batch exists.
- Reject references to missing or ambiguous nodes.

Executor behavior:

- Create edge between resolved nodes.
- Preserve order for storyboard chains.

Preview behavior:

- Count connections and show in workflow summary.

Auto apply policy:

- Safe when both endpoints are valid.

Undo/history behavior:

- Connections created in a workflow batch undo with the batch.

Tests:

- `claw_action_schema_test.py`
- `modules/assistant/assistantActionExecutor.test.js`

## Action: layout_nodes

Required fields:

- `type=layout_nodes`
- `nodeIds`
- `layout`

Optional fields:

- `metadata`
- `origin`
- `spacing`

Allowed layouts:

- `horizontal`
- `vertical`
- `grid`
- `single_chain`
- `branch_flow`
- `storyboard_grid`
- `asset_lane`
- `problem_lane`

Schema repair policy:

- Accept prompt-declared safe layout strategies.
- Reject unsupported layout strings.
- Reject missing or nonexistent `nodeIds`.

Executor behavior:

- Arrange nodes without overlap.
- For `storyboard_grid`, place outline/style on the left and shot rows in order.
- Focus viewport on the resulting workflow when possible.

Preview behavior:

- Show layout intent and affected node count.

Auto apply policy:

- Safe for non-destructive layout-only changes.

Undo/history behavior:

- Layout changes must be undoable.

Tests:

- `claw_action_schema_test.py`
- `modules/assistant/assistantActionExecutor.test.js`

## Action: create_group

Required fields:

- `type=create_group`
- `nodeIds`

Optional fields:

- `groupId`
- `name`
- `metadata`

Common model aliases:

- `nodes` -> `nodeIds`
- `children` -> `nodeIds`

Schema repair policy:

- Repair equivalent node id list aliases.
- In a valid workflow batch, ignore empty placeholder `create_group` actions with a warning.
- Standalone empty `create_group` must fail.

Executor behavior:

- Group or visually summarize node set only when frontend supports it.
- If grouping is not supported, keep nodes unchanged and provide a clear receipt.

Preview behavior:

- Show group creation only when it will be applied.

Auto apply policy:

- Safe only for non-destructive grouping.

Undo/history behavior:

- Group creation must undo with the batch.

Tests:

- `claw_action_schema_test.py`
- `modules/assistant/assistantActionExecutor.test.js`

## Action: queue_generation_task

Required fields:

- `type=queue_generation_task`
- `nodeId`

Optional fields:

- `nodeType`
- `provider`
- `presetId`
- `prompt`
- `metadata`

Schema repair policy:

- Accept text/image generation queue when node type is safe and node exists.
- Reject or require confirmation for `ai-video` unless the user explicitly authorized video generation in the same request.
- Reject fabricated node references.

Executor behavior:

- Queue and start text/image generation when allowed.
- Wait for renderer mount if needed.
- Keep video tasks blocked until authorization.

Preview behavior:

- Show which text/image tasks will start.
- State that video generation still requires confirmation.

Auto apply policy:

- Text/image can auto-run.
- Video cannot auto-run.

Undo/history behavior:

- Queued state changes should be part of the operation history when possible.

Tests:

- `claw_bridge_service_test.py`
- `claw_action_schema_test.py`
- `modules/assistant/assistantActionExecutor.test.js`
- `modules/app/appAssistantPanel.test.js`

## Action: run_prompt_preset_generation

Required fields:

- `type=run_prompt_preset_generation`
- `nodeId`
- `presetId` or resolvable preset name

Optional fields:

- `prompt`
- `inputs`
- `metadata`

Common model aliases:

- `presetName` -> resolvable preset
- `slashPreset` -> preset reference

Schema repair policy:

- Resolve only existing slash preset references supplied by app context.
- Do not expose full preset prompt text back to the chat unless user asked to inspect it.
- Reject fabricated preset ids.

Executor behavior:

- Trigger the preset directly on the target node.
- Do not paste the preset content into the user input box as a selection workaround.

Preview behavior:

- Show preset name and target node.

Auto apply policy:

- Text/image preset generation can auto-run.
- Video preset generation requires confirmation.

Undo/history behavior:

- Record the preset task in recent operations.

Tests:

- `claw_bridge_service_test.py`
- `modules/assistant/assistantActionExecutor.test.js`
- `modules/app/appAssistantPanel.test.js`

## Action: duplicate_nodes

Required fields:

- `type=duplicate_nodes`
- `nodeIds`

Optional fields:

- `offset`
- `nameSuffix`
- `metadata`

Schema repair policy:

- Reject nonexistent node ids.
- Reject destructive overwrite.
- Sanitize copied metadata.

Executor behavior:

- Duplicate nodes with non-overlapping offset.
- Preserve safe links only when requested and unambiguous.

Preview behavior:

- Show duplicated node count.

Auto apply policy:

- Safe for non-destructive duplication.

Undo/history behavior:

- Duplicates undo as a batch.

Tests:

- `claw_action_schema_test.py`
- `modules/assistant/assistantActionExecutor.test.js`

## Action: create_workflow_template

Required fields:

- `type=create_workflow_template`
- `name`
- `nodes` or `nodeIds`

Optional fields:

- `description`
- `metadata`
- `tags`

Schema repair policy:

- Require user confirmation for persistent template save if it changes shared library state.
- Reject unsafe embedded secrets, local paths, data URLs, and blobs.

Executor behavior:

- Create a reusable template only after policy allows it.
- Keep source canvas unchanged unless explicitly requested.

Preview behavior:

- Show template name and included node count.

Auto apply policy:

- Confirmation required when persistence is involved.

Undo/history behavior:

- Record template creation separately from canvas mutation.

Tests:

- `claw_action_schema_test.py`
- `modules/app/appAssistantPanel.test.js`
