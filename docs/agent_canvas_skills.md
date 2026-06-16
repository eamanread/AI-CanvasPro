# Agent Canvas Skills Capability Inventory

Date: 2026-06-06

This document describes the implemented Canvas Skills surface used by the Agent panel. The module lives in `modules/assistant/canvasSkills/` and the older `modules/assistant/assistantCanvas*.js` files remain as compatibility entrypoints.

## Runtime Chain

```text
Agent panel
  -> Agent chat / streaming API
  -> proposed actions
  -> Canvas Skills runtime
  -> schema validator and registry
  -> existing canvas APIs
  -> node renderer _onGenerate / onGenerate
  -> redacted trace cards
```

Canvas Skills must not create a parallel node system. Node drafts go through `createNodeAtCursor`, updates go through the graph store adapter, generation goes through the mounted renderer instance, workflows go through the existing workflow service/canvas adapter, and assets go through the existing asset store plus `saveAssetToServer` style persistence.

## Public Skills

| Skill ID | Purpose | Main parameters | Main dependency | Confirmation |
| --- | --- | --- | --- | --- |
| `imageNode.createDraft` | Create editable image draft | `prompt`, `modelId`, `provider`, `aspectRatio`, `imageSize`, `quality`, `batchSize`, `references`, `presetId`, `template`, `inputs` | `createNodeAtCursor` | No confirmation |
| `imageNode.update` | Update image node data | supported image schema fields | graph update adapter | No confirmation |
| `imageNode.bindReferences` | Bind image references | `references` | reference binder | No confirmation |
| `imageNode.applyPreset` | Apply image prompt preset | `presetId`, `presetName`, `template`, `inputs` | prompt preset adapter | No confirmation |
| `imageNode.generate` | Submit image generation | `prompt`, `modelId`, `provider` | renderer `_onGenerate` / `onGenerate` | No confirmation unless part of multi-node plan batch |
| `textNode.createDraft` | Create editable text draft | `prompt`, `modelId`, `provider`, `references`, `presetId`, `template`, `inputs` | `createNodeAtCursor` | No confirmation |
| `textNode.update` | Update text node data | supported text schema fields | graph update adapter | No confirmation |
| `textNode.bindReferences` | Bind text references | `references` | reference binder | No confirmation |
| `textNode.applyPreset` | Apply text preset | `presetId`, `presetName`, `template`, `inputs` | prompt preset adapter | No confirmation |
| `textNode.generate` | Submit text generation | `prompt`, `modelId`, `provider` | renderer `_onGenerate` / `onGenerate` | No confirmation unless part of multi-node plan batch |
| `videoNode.createDraft` | Create editable video draft | `prompt`, `modelId`, `provider`, `duration`, `fps`, `resolution`, `references`, `presetId`, `template`, `inputs` | `createNodeAtCursor` | No confirmation |
| `videoNode.update` | Update video node data | supported video schema fields | graph update adapter | No confirmation |
| `videoNode.bindReferences` | Bind video references | `references` | reference binder | No confirmation |
| `videoNode.applyPreset` | Apply video preset | `presetId`, `presetName`, `template`, `inputs` | prompt preset adapter | No confirmation |
| `videoNode.generate` | Submit video generation | `prompt`, `modelId`, `provider` | renderer `_onGenerate` / `onGenerate` | Plan mode requires confirmation; act mode does not |
| `node.bindReferences` | Bind generic `@` references | uploaded references, canvas nodes, assets | reference binder | No confirmation |
| `workflow.apply` | Apply workflow to canvas | workflow identity and placement | existing workflow canvas adapter | No confirmation unless risky overwrite is implied |
| `workflow.save` | Save workflow | `name`, `scope`, `selectedNodeIds`, tags | existing workflow service | Plan mode confirms broad inferred scope |
| `workflow.update` | Update workflow | workflow identity and selected scope | existing workflow service | Plan mode confirms broad inferred scope |
| `asset.list` | Read asset library | `query`, `category`, `sourceNodeId` | asset catalog/search | No confirmation |
| `asset.use` | Use asset as reference | `assetId`, `query` | asset store and reference binder | No confirmation |
| `asset.add` | Save asset | source node/result/file metadata | existing save asset API | Requires explicit save intent |

## Schema Rules

- Supported fields are writable by the Agent.
- Planned fields are recognized but warning-only; they are not written into node data.
- Unknown fields are warning-only.
- Internal or secret-like fields are blocked and redacted.
- `model`, `modelName`, and `modelDisplayName` are aliases; the patch writes `modelId` and optional `provider`.
- A model must match the node type and configured model registry before it is written.

Current schema coverage:

- Image supported: `prompt`, `modelId`, `provider`, `aspectRatio`, `imageSize`, `quality`, `batchSize`, `references`, `presetId`, `presetName`, `template`, `inputs`.
- Text supported: `prompt`, `modelId`, `provider`, `references`, `presetId`, `presetName`, `template`, `inputs`.
- Video supported: `prompt`, `modelId`, `provider`, `duration`, `fps`, `resolution`, `references`, `presetId`, `presetName`, `template`, `inputs`.

## Trace Cards

When canvas work runs, the executor emits redacted `skill_trace` cards under the assistant reply. The card records skill id, node id/type, status, model display summary, parameter summary, reference count, warnings, and timing-style metadata when available. Conversation storage and audit export re-redact trace cards so API keys, bearer tokens, signed URL query parameters, long base64 payloads, and secret-shaped fields do not persist.

## Asset Library

`@ 我的资产` uses the Canvas Skills asset services for:

- Default categories: `character`, `scene`, `object`, `clothing`, `style`, `custom`.
- Extensible categories through `listAssetCategories(extraCategories)`.
- Search by name, tag, category, and source node.
- Sort priority: pinned, favorite, then recent update/use.
- Lightweight duplicate detection by duplicate key, id, file name/size, or source node/result.
- Local import safety: user-authorized `File`-like payloads only; raw local path strings are rejected.
- Import file gates: PNG/JPEG/WebP/GIF; SVG only when `safeSvgEnabled` is true; MIME/extension mismatch is rejected.
- Reference health warnings for deleted source nodes and missing thumbnail/media URLs.

## Real API Smoke

Standalone:

```powershell
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode Module
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode Browser
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode All
```

R5 optional:

```powershell
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_r5_regression.ps1 -Url http://127.0.0.1:8777 -Out output\regression\assistant-live-r5-real-smoke -RealApiSmoke -RealApiSmokeMode Module
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_r5_regression.ps1 -Url http://127.0.0.1:8777 -Out output\regression\assistant-live-r5-real-smoke-strict -RealApiSmoke -RealApiSmokeMode All -FailOnSmokeFailure
```

Smoke uses the existing app/project configuration only. It does not accept API keys or tokens as CLI parameters. Default success means the text model connected and image generation submission was accepted through a task id, submitted/queued/running/generating state, or Canvas Skills generation receipt. Browser smoke must observe panel streaming/done plus a `skill_trace` card, and can use `debugSnapshot().assistant.lastReceiptDetails.queuedGenerationNodeIds` or `startedGenerationNodeIds` when the graph snapshot has not yet persisted node state. It does not wait for final image pixels.

## Degraded Load

If Canvas Skills cannot load, chat stays available but canvas operations are disabled. `debugSnapshot().canvasSkills` reports `chatOnly: true`, and the panel shows the transient notice `画布 Skills 未加载，当前只能聊天，不能操作画布。`

## Known Limits

- Default real API smoke does not verify final generated image files.
- Real video generation smoke is not required in this version.
- Asset dedupe is lightweight; perceptual hash and embedding dedupe are reserved.
- Semantic asset search is reserved.
- Browser smoke depends on a user-managed `127.0.0.1:8777` app when run for release acceptance.
