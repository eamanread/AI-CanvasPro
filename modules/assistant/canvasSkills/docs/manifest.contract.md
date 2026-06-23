# Canvas Skills Manifest Contract

Schema version: `canvas-skills-manifest-v1`

Module id: `huanying.canvasSkills`

Version: `1.0.0`

Capabilities:

- `node`
- `generation`
- `reference`
- `workflow`
- `asset`
- `trace`
- `smoke`

## Stable Skill IDs

Node skills:

- `imageNode.createDraft`
- `imageNode.update`
- `imageNode.bindReferences`
- `imageNode.applyPreset`
- `imageNode.generate`
- `textNode.createDraft`
- `textNode.update`
- `textNode.bindReferences`
- `textNode.applyPreset`
- `textNode.generate`
- `videoNode.createDraft`
- `videoNode.update`
- `videoNode.bindReferences`
- `videoNode.applyPreset`
- `videoNode.generate`
- `node.bindReferences`

Workflow skills:

- `workflow.apply`
- `workflow.save`
- `workflow.update`

Asset skills:

- `asset.list`
- `asset.use`
- `asset.add`

## Compatibility

Legacy imports from `modules/assistant/assistantCanvasSkillRegistry.js` delegate to the new manifest/registry. This keeps existing callers stable while the new module becomes the primary surface.

## Confirmation Policy Summary

- Single image/text create/update/generate: no confirmation in plan or act mode.
- Single video create/update: no confirmation.
- Single video generate: confirmation in plan mode; no confirmation in act mode.
- Multi-node one-shot generation: confirmation in plan mode; no confirmation in act mode.
- Asset list/use: no confirmation.
- Asset add/save: explicit save intent is still required.
