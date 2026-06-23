# Upstream-First Director / Storyboard Design

**Goal:** Reintroduce Director stage and Storyboard capabilities by copying or adapting upstream source first, while preserving Huanying's existing local runtime, data, and assistant-skill boundaries.

**Status:** This is a design/spec document only. It does not modify the original development plan, and it is not an implementation plan.

**Source of truth:** `D:\Aic\huanying-source-windows-20260430-122116\output\upstream\AI-CanvasPro`

---

## 1. Non-Negotiable Rule

For Director stage and Storyboard, UI, interaction, and logic must follow this order:

1. Use upstream source code when upstream has the capability.
2. Adapt upstream code only where Huanying local paths, existing services, or runtime differences require glue.
3. Self-develop only after an explicit upstream-gap decision is recorded in this document or in the later implementation plan.
4. Do not replace upstream behavior with a locally invented equivalent when the upstream behavior is present and adaptable.

This rule applies to:

- Node data factories and persisted node types.
- Canvas entry points and context-menu / toolbar entry points.
- Node component UI and CSS.
- User interactions, click handlers, popovers, fullscreen panels, and canvas edge behavior.
- Group execution and selected-node execution behavior.
- Tests that define accepted behavior.

---

## 2. Rollback Baseline

The previous non-upstream-first implementation has been removed from the codebase baseline before this design is written.

The original development plan remains untouched:

- `D:\Aic\huanying-source-windows-20260430-122116\docs\superpowers\plans\2026-06-07-huanying-director-storyboard-workflow-migration.md`

The previous review document also remains as historical review output:

- `D:\Aic\huanying-source-windows-20260430-122116\docs\reviews\2026-06-08-director-storyboard-workflow-migration-review.md`

Implementation after this spec must start from the rollback baseline, not from the previous custom execution-engine implementation.

---

## 3. Upstream Inventory

### 3.1 Storyboard Upstream Files

Use these upstream files as the primary implementation source:

- `output\upstream\AI-CanvasPro\src\core\storyboardScriptFactory.js`
- `output\upstream\AI-CanvasPro\src\core\storyboardScriptGeneration.js`
- `output\upstream\AI-CanvasPro\src\components\StoryboardScriptNode.js`
- `output\upstream\AI-CanvasPro\src\components\nodeToolbar\storyboardScriptAction.js`
- `output\upstream\AI-CanvasPro\src\components\nodeToolbar\storyboardScriptToolbarIcon.js`
- `output\upstream\AI-CanvasPro\styles\storyboard-script-node.css`
- `output\upstream\AI-CanvasPro\src\modules\app\appNodeEntry.js`
- `output\upstream\AI-CanvasPro\src\core\interaction.js`
- `output\upstream\AI-CanvasPro\src\modules\interaction\EdgeController.js`

Local target mapping:

| Capability | Upstream source | Local target |
| --- | --- | --- |
| Storyboard data defaults and node factory | `src\core\storyboardScriptFactory.js` | `src\core\storyboardScriptFactory.js` |
| Storyboard generation / normalization logic | `src\core\storyboardScriptGeneration.js` | `src\core\storyboardScriptGeneration.js` |
| Storyboard node UI and interactions | `src\components\StoryboardScriptNode.js` | `components\StoryboardScriptNode.js` |
| Toolbar action | `src\components\nodeToolbar\storyboardScriptAction.js` | `components\nodeToolbar\storyboardScriptAction.js` |
| Toolbar icon | `src\components\nodeToolbar\storyboardScriptToolbarIcon.js` | `components\nodeToolbar\storyboardScriptToolbarIcon.js` |
| Styling | `styles\storyboard-script-node.css` | `styles\storyboard-script-node.css` |
| Canvas add-node entry | `src\modules\app\appNodeEntry.js` | Patch only the matching local entry surface |
| Drop / edge behavior | `src\core\interaction.js`, `src\modules\interaction\EdgeController.js` | Minimal local patches around upstream-defined entry points |

### 3.2 Director / Panorama Scene Upstream Files

Use these upstream files as the primary implementation source:

- `output\upstream\AI-CanvasPro\src\modules\panoramaSceneNode\sceneNode.js`
- `output\upstream\AI-CanvasPro\src\modules\panoramaSceneNode\sceneNodeActions.js`
- `output\upstream\AI-CanvasPro\src\components\PanoramaSceneNode.js`
- `output\upstream\AI-CanvasPro\src\components\panoramaScene\CameraPresetList.js`
- `output\upstream\AI-CanvasPro\src\components\panoramaScene\MannequinQuickMenu.js`
- `output\upstream\AI-CanvasPro\src\components\panoramaScene\PanoramaModeToolbar.js`
- `output\upstream\AI-CanvasPro\src\components\panoramaScene\PanoramaSceneBottomToolbar.js`
- `output\upstream\AI-CanvasPro\src\components\panoramaScene\PanoramaSceneCornerToolbar.js`
- `output\upstream\AI-CanvasPro\src\components\panoramaScene\PanoramaSceneToolbar.js`
- `output\upstream\AI-CanvasPro\styles\panorama-scene-node.css`
- `output\upstream\AI-CanvasPro\styles\panorama-scene-toolbar.css`
- `output\upstream\AI-CanvasPro\styles\panorama-scene-popover.css`

Local target mapping:

| Capability | Upstream source | Local target |
| --- | --- | --- |
| Director node data and persisted type | `src\modules\panoramaSceneNode\sceneNode.js` | `modules\panoramaSceneNode\sceneNode.js` |
| Director node actions | `src\modules\panoramaSceneNode\sceneNodeActions.js` | `modules\panoramaSceneNode\sceneNodeActions.js` |
| Director node UI and interactions | `src\components\PanoramaSceneNode.js` | `components\PanoramaSceneNode.js` |
| Director subcomponents | `src\components\panoramaScene\*.js` | `components\panoramaScene\*.js` |
| Director CSS | `styles\panorama-scene-*.css` | `styles\panorama-scene-*.css` |
| Canvas entry / context menu | `src\modules\app\appNodeEntry.js`, `src\core\interaction.js` | Minimal local patches around upstream-defined entry points |

The persisted Director stage node type must remain the upstream-compatible `panorama-scene` unless an upstream-gap decision explicitly proves a different type is necessary.

### 3.3 Group / Selected Execution Upstream Files

Use this upstream behavior before considering any local execution engine:

- `output\upstream\AI-CanvasPro\src\modules\groupExecution.js`
- `output\upstream\AI-CanvasPro\src\components\GroupNode.js`

Upstream behavior found in `groupExecution.js`:

- Group execution is button-click based.
- It locates existing generation buttons inside the group, especially `.prompt-submit.img-gen-btn:not(.debug-wrench-btn)`.
- It clicks existing node generation controls instead of recreating provider execution in a new engine.

Local design implication:

- Do not recreate `canvasExecutionEngine`, `groupRuntime`, or assistant-only provider dispatch as the baseline.
- If selected-node execution is needed, first adapt the upstream button-click execution model to the selected-node scope.
- A custom execution engine is allowed only if upstream behavior is proven insufficient and the exact upstream gap is recorded.

---

## 4. Feature Design

### 4.1 Storyboard

Storyboard must be implemented as an upstream-backed canvas node, not as an assistant-skill replacement.

Required baseline behavior:

- Add the upstream Storyboard node type and factory from `storyboardScriptFactory.js`.
- Render the upstream `StoryboardScriptNode` component with its upstream UI, editing surfaces, generation controls, fullscreen behavior, and media/image interactions.
- Use upstream `storyboardScriptGeneration.js` for storyboard script data normalization and generation logic.
- Add the upstream toolbar action and toolbar icon exactly where Huanying's toolbar system expects node actions.
- Add the upstream CSS instead of recreating the visual treatment.
- Patch canvas add/drop/edge wiring only where upstream `appNodeEntry.js`, `interaction.js`, or `EdgeController.js` define Storyboard integration points.

Boundary with existing assistant skills:

- Keep `config\assistant-skills\storyboard_director.json` separate.
- Do not fold the existing assistant skill into the Storyboard node migration.
- The Storyboard node may expose canvas behavior; the assistant skill remains an assistant workflow capability unless a later approved design explicitly connects them.

### 4.2 Director Stage

Director stage must use upstream panorama scene code as the baseline.

Required baseline behavior:

- Keep the persisted node type `panorama-scene`.
- Use upstream `sceneNode.js` for data defaults, scene view defaults, and node type constants.
- Use upstream `sceneNodeActions.js` for object, camera, selection, capture, view, upload, and sync actions.
- Use upstream `PanoramaSceneNode.js` and `components\panoramaScene\*.js` for the UI and interactions.
- Use upstream `panorama-scene-node.css`, `panorama-scene-toolbar.css`, and `panorama-scene-popover.css` for visual behavior.
- Patch local import paths and service bridges only where Huanying's module structure differs from upstream.

Allowed local adaptation:

- Import path correction between upstream `src\...` layout and local root-level `components\...` / `modules\...` layout.
- Existing Huanying runtime or service differences, such as file upload, toast, state manager, or 3D runtime paths.
- Tests that prove upstream behavior survives the local adaptation.

Not allowed without an upstream-gap decision:

- Replacing upstream Director UI with a newly designed UI.
- Changing the persisted node type away from `panorama-scene`.
- Reimplementing scene selection, camera, capture, or toolbar interactions when upstream logic can be copied/adapted.

### 4.3 Group Run / Selected Run

Group run and selected run must start from upstream `groupExecution.js`.

Required baseline behavior:

- Copy/adapt upstream `executeGroupGenerateButtons` into local `modules\groupExecution.js`.
- Wire `components\GroupNode.js` to call upstream-style group execution from its group run button.
- Preserve upstream's model of triggering existing node generation buttons.
- Use existing node UI controls as the execution source of truth.

Selected-node execution design:

- If upstream has a selected-node execution entry in the inspected source, copy/adapt it.
- If upstream only provides group execution, selected-node execution may be a small adapter around the same upstream button-click model.
- The selected-node adapter must not become a provider-level custom execution engine.

Explicitly excluded baseline files:

- `modules\workflows\canvasExecutionEngine.js`
- `modules\workflows\groupRuntime.js`
- `modules\workflows\groupExecutionEvents.js`

These files may be introduced only after a recorded upstream-gap decision and user approval.

---

## 5. Integration Policy

### 5.1 Copy / Adapt Strategy

Use the least invasive strategy per file type:

1. For isolated upstream files, copy the upstream file and adjust import paths only.
2. For local files that already contain upstream-compatible code, patch only the missing upstream sections.
3. For large or obfuscated local single-line files, patch minimally around upstream-defined entry points.
4. Never wholesale overwrite local `main.js`, `index.html`, `components\GroupNode.js`, or `src\core\interaction.js`.
5. Keep local Huanying-specific services intact unless upstream has a directly compatible replacement.

### 5.2 Adapter Rules

An adapter is allowed when it is small and traceable:

- Import path adapter.
- State manager bridge.
- File service bridge.
- Toast / notification bridge.
- Existing provider button bridge.
- CSS import / registration bridge.

Each adapter must identify the upstream source it preserves.

### 5.3 Upstream-Gap Decision Log Requirement

Before self-developing any non-trivial behavior, record:

- Required behavior.
- Upstream files inspected.
- Why upstream behavior cannot be copied or adapted.
- Proposed local implementation boundary.
- Tests that will prove the local implementation does not replace unrelated upstream behavior.

Without that record, the implementation must stop at upstream copy/adaptation.

---

## 6. Testing Policy

Tests must prove upstream-first parity and prevent accidental reintroduction of the previous custom baseline.

Required test categories:

1. Storyboard upstream presence
   - `src\core\storyboardScriptFactory.js` exists locally after implementation.
   - `src\core\storyboardScriptGeneration.js` exists locally after implementation.
   - `components\StoryboardScriptNode.js` exists locally after implementation.
   - `components\nodeToolbar\storyboardScriptAction.js` exists locally after implementation.
   - `styles\storyboard-script-node.css` exists locally after implementation.

2. Storyboard separation from assistant skill
   - `config\assistant-skills\storyboard_director.json` remains present and separate.
   - Storyboard node wiring does not mutate that assistant skill definition.

3. Director upstream presence
   - Local Director files keep upstream-compatible `panorama-scene` behavior.
   - `PanoramaSceneNode` remains the Director node renderer.
   - Panorama toolbar/popover styles are loaded.

4. Group execution upstream model
   - `modules\groupExecution.js` exists only when copied/adapted from upstream.
   - Group run triggers existing generation buttons instead of a custom provider execution engine.
   - No `canvasExecutionEngine` or `groupRuntime` baseline is present unless an upstream-gap decision exists.

5. Regression coverage
   - Existing Canvas tests still pass.
   - Existing Assistant canvas-skill tests still pass.
   - Storyboard and Director tests cover local adapter behavior, not invented behavior.

Suggested verification commands for the later implementation plan:

```powershell
& 'D:\Aic\node.exe' --check main.js
& 'D:\Aic\node.exe' --check src\core\interaction.js
& 'D:\Aic\node.exe' --check components\GroupNode.js
& 'D:\Aic\node.exe' --test indexEncoding.test.js modules\assistant\canvasSkills\manifest.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\assistantCanvasWorkflowSkills.test.js
rg -n "canvasExecutionEngine|groupRuntime|workflow:execute-group|group-runtime-status|video_generation_requires_authorization" -g '!output/upstream/**' -g '!.codegraph/**' -g '!node_modules/**' -g '!docs/**' .
```

---

## 7. Decision Log

### Decision 1: Previous custom execution engine is not the baseline

Upstream contains `output\upstream\AI-CanvasPro\src\modules\groupExecution.js`, and CodeGraph identifies `executeGroupGenerateButtons` as an upstream function imported by upstream `GroupNode.js`.

Therefore the baseline must use upstream group execution. A local `canvasExecutionEngine` or `groupRuntime` is not allowed unless a later upstream-gap decision proves the upstream button-click model cannot satisfy the approved requirement.

### Decision 2: Storyboard node is separate from `storyboard_director` assistant skill

The upstream Storyboard files define a canvas node, node factory, toolbar action, and node UI. Huanying's `config\assistant-skills\storyboard_director.json` is a separate assistant skill definition.

Therefore the baseline migration must not replace one with the other. Any bridge between the canvas Storyboard node and assistant skill requires separate approval.

### Decision 3: Director stage keeps `panorama-scene`

Upstream panorama scene files define the Director-like scene node capability and the local codebase already has panorama scene symbols indexed.

Therefore the implementation must preserve `panorama-scene` as the persisted node type and adapt upstream panorama scene UI/logic, rather than introducing a new Director-only node type.

### Decision 4: Self-development is limited to glue unless approved

The only self-developed code allowed by default is adapter glue, tests, or documented local service bridges. New UI, new interactions, and new provider execution logic are outside the baseline unless upstream lacks the capability and the gap is recorded.

---

## 8. Implementation Gate

Stop after this design document.

Before implementation, the next step is to write a new implementation plan that follows this spec and explicitly lists:

- Which upstream files are copied unchanged.
- Which upstream files are copied with import-path adaptation.
- Which local files are minimally patched.
- Which behavior, if any, needs an upstream-gap decision.
- Which tests prove upstream-first compliance.

No implementation should begin until this design document is reviewed and approved.
