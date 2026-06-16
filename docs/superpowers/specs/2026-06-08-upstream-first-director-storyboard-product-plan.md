# Upstream-First Director / Storyboard Product Plan

**Date:** 2026-06-08

**Product scope:** 3D Director stage (`panorama-scene`) and Storyboard Script (`storyboard-script`) canvas capabilities.

**Source of truth:** `D:\Aic\huanying-source-windows-20260430-122116\output\upstream\AI-CanvasPro`

**Related design:** `D:\Aic\huanying-source-windows-20260430-122116\docs\superpowers\specs\2026-06-08-upstream-first-director-storyboard-design.md`

**Important boundary:** Group run / selected-node run is not part of this product scope unless implementation proves it is a required upstream dependency for Director or Storyboard interactions.

---

## 1. Product Intent

This product plan migrates upstream Director and Storyboard capabilities into Huanying as real canvas features, while keeping Huanying-specific assistant skills and workflow execution separate.

The intended user experience is:

- A creator can add a **3D???** node to stage characters, cameras, objects, panorama backgrounds, and capture views.
- A creator can add a **????** node to turn text, image, or video context into a structured shot table, edit each shot, switch display modes, and use the generated prompts for downstream image/video creation.
- Existing Huanying nodes, assistant skills, provider controls, and project data continue to work.
- The migration behaves like upstream where upstream source exists; local code only adapts module paths, services, and runtime boundaries.

---

## 2. Product Principles

1. **Upstream first:** UI, interaction, data model, and business logic come from upstream code when upstream has the capability.
2. **No silent reimplementation:** A local alternative is not allowed when an upstream behavior can be copied or adapted.
3. **Persisted type compatibility:** Director stage uses `panorama-scene`; Storyboard Script uses `storyboard-script`.
4. **Old and new storyboard concepts coexist:** Existing `storyboard` node and `config\assistant-skills\storyboard_director.json` remain separate from the new `storyboard-script` node.
5. **No custom execution engine in this scope:** `canvasExecutionEngine`, `groupRuntime`, and group workflow events are excluded unless a later upstream-gap decision is approved.
6. **Provider safety:** Any action that starts provider generation must continue to use Huanying's existing provider controls, authorization gates, and visible user actions.

---

## 3. Users and Jobs To Be Done

### 3.1 Creator / Story Artist

- Add a 3D stage to block a scene before generating final visuals.
- Plan shots with consistent shot numbers, duration, scene description, character action, image prompts, and video prompts.
- Edit AI-generated shot data before using it downstream.
- Export or copy shot planning data for review.

### 3.2 Video Creator

- Start from an existing video node and create a connected Storyboard Script node.
- Extract narrative / temporal structure from a video into editable shot rows.
- Use image/video prompt columns to continue generation work.

### 3.3 Power Canvas User

- Use add-node menu, context menu, side-plus connections, and node toolbar actions consistently.
- Keep old projects working while new nodes are introduced.
- Avoid hidden dev-mode-only access for product features that are intended to be user-visible.

---

## 4. Feature Overview

| Area | Feature | Product decision | Upstream source |
| --- | --- | --- | --- |
| Director | Visible 3D??? entry | In scope | `sceneNode.js`, `PanoramaSceneNode.js`, `appNodeEntry.js`, `interaction.js` |
| Director | Persisted node type | Must stay `panorama-scene` | `sceneNode.js` |
| Director | Scene UI and object controls | In scope; use upstream | `PanoramaSceneNode.js`, `components\panoramaScene\*.js` |
| Director | Panorama / camera / capture actions | In scope; use upstream actions | `sceneNodeActions.js` |
| Storyboard | ???? node | In scope | `storyboardScriptFactory.js`, `StoryboardScriptNode.js` |
| Storyboard | Text/image/video prompt generation | In scope; use upstream prompt builders | `storyboardScriptGeneration.js` |
| Storyboard | Video toolbar to Storyboard Script | In scope when video node toolbar exists | `storyboardScriptAction.js`, `storyboardScriptToolbarIcon.js`, `videoToolbar.js` |
| Storyboard | Side-plus / edge support | In scope if required to match upstream creation flow | `EdgeController.js` |
| Storyboard | Assistant `storyboard_director` bridge | Out of scope | Existing Huanying assistant skill remains separate |
| Group/selected run | Execute group / execute selected | Out of scope by default | `groupExecution.js` only if dependency is proven |

---

## 5. 3D Director Stage Product Design

### 5.1 User-Facing Name and Entry

- User-facing label: `3D???`.
- Persisted node type: `panorama-scene`.
- Existing `panorama-360` remains a separate upstream-compatible node type.
- Add-node surfaces that already expose product nodes should expose `3D???` without a dev-mode gate.

Expected entry points:

- Left add-node menu, when present.
- Hover add-node picker / canvas add menu, when present.
- Canvas context menu add-node path, when present.

### 5.2 Director Node Defaults

Upstream `createPanoramaSceneNodeData()` defines the product baseline:

```json
{
  "type": "panorama-scene",
  "width": 1024,
  "height": 576,
  "name": "3D???",
  "sceneNode": {
    "version": 1,
    "mode": "scene",
    "environmentMode": "night",
    "viewport": {
      "activeView": "default",
      "activeCameraId": null,
      "sceneView": {
        "target": { "x": 0, "y": 1.2, "z": 0 },
        "orbitYaw": 0.7853981633974483,
        "orbitPitch": 0.7853981633974483,
        "orbitDistance": 9
      },
      "panoramaView": { "yaw": 0, "pitch": 0, "fov": 55 }
    },
    "mannequins": [],
    "cubes": [],
    "cameras": [],
    "selection": {
      "selectedObjectType": null,
      "selectedObjectId": null,
      "selectedObjectIds": [],
      "selectedObjects": [],
      "selectedGroupId": null
    },
    "groups": [],
    "capture": {
      "pending": false,
      "lastCaptureAt": null,
      "error": null,
      "mode": "adaptive",
      "showSafeFrame": false
    },
    "ui": {
      "mouseTool": "navigate",
      "transformTool": "move",
      "activeTool": "navigate",
      "transformSpace": "local",
      "pivotMode": "active",
      "navigationPreset": "dcc",
      "showCameraList": false,
      "isEditing": false
    }
  }
}
```

Local verification already shows local and upstream default scene JSON are equivalent for `createPanoramaSceneNodeData()`. The product work is therefore calibration and style/entry completion, not a redesign.

### 5.3 Director Interactions

The Director stage should expose upstream interactions:

- **Enter / exit editing:** Node-level toolbar and mode toolbar allow the user to enter scene editing and return to canvas mode.
- **Navigation:** Mouse tool defaults to `navigate`; camera orbit target and orbit distance are persisted.
- **Transform tools:** Move, rotate, and scale modes operate on selected scene objects.
- **Object creation:** User can add mannequins, mannequin grids, cubes, and cameras through upstream scene controls.
- **Selection:** User can select one object, multi-select objects, select grouped mannequins, clear selection, and focus selection.
- **Camera management:** User can add, activate, rename, delete, and slot cameras; active camera is persisted in `viewport.activeCameraId`.
- **Panorama image upload:** User can upload a panorama image or sync incoming image edge data where upstream supports it.
- **Capture:** User can capture the current stage viewport into a source image node through upstream `capturePanoramaSceneViewport()` behavior.
- **Collapse / expand:** User can collapse the node and restore its original dimensions.
- **Fullscreen / toolbar affordances:** Upstream component and CSS define toolbar and popover behavior.

### 5.4 Director Data Model

| Field | Meaning | Product rule |
| --- | --- | --- |
| `type` | Persisted node type | Must be `panorama-scene` |
| `name` | User-facing node title | Defaults to `3D???` |
| `sceneNode.version` | Schema version | Keep upstream value `1` |
| `sceneNode.mode` | Scene vs panorama mode | Director uses `scene` |
| `sceneNode.environmentMode` | Environment preset | Defaults to `night` |
| `sceneNode.viewport` | Camera / orbit / panorama view | Persist all upstream fields |
| `sceneNode.panorama` | Uploaded panorama metadata | Use upstream local path / URL fields |
| `sceneNode.mannequins` | Character stand-ins | Use upstream object schema |
| `sceneNode.cubes` | Basic scene objects | Use upstream object schema |
| `sceneNode.cameras` | Camera list | Use upstream camera schema and limit |
| `sceneNode.selection` | Current selection | Use upstream single and multi-selection fields |
| `sceneNode.groups` | Scene object grouping | Preserve upstream group schema |
| `sceneNode.gridPlacement` | Mannequin grid defaults | Preserve upstream rows, cols, spacing, gender, color |
| `sceneNode.capture` | Capture runtime state | Persist pending/error/last capture fields |
| `sceneNode.ui` | Tool and panel state | Persist upstream UI state |

### 5.5 Director Non-Goals

- Do not rename persisted type to `director-stage`.
- Do not replace upstream `PanoramaSceneNode` with new local UI.
- Do not change camera/object/selection schema unless upstream code requires it.
- Do not introduce a separate Director assistant workflow in this migration.

---

## 6. Storyboard Script Product Design

### 6.1 User-Facing Name and Entry

- User-facing label: `????`.
- Persisted node type: `storyboard-script`.
- Default node name: `????`.
- Default size: `1024 x 576`.
- Default view mode: `list`.
- Default media mode: `image`.

Expected entry points:

- Add-node menu / picker item for `????`.
- Canvas context menu add-node path for `storyboard-script` where the current UI supports context creation.
- Side-plus / edge creation where upstream allows media or text source nodes to connect into Storyboard Script.
- Video node toolbar action that creates a connected Storyboard Script node from `source-video` or `ai-video`.

### 6.2 Storyboard Script Core Jobs

The Storyboard Script node should support:

1. **Create an empty shot-planning table** with upstream default state.
2. **Generate shot rows from text input** using upstream text-only prompt builders.
3. **Generate shot rows from image context** using upstream image prompt builders.
4. **Generate shot rows from video context** using upstream video prompt builders and video-frame API support.
5. **Render rows as editable shot planning content**.
6. **Switch display modes** using upstream view controls.
7. **Switch media focus** between image-oriented and video-oriented prompt workflows.
8. **Select rows** for targeted downstream work.
9. **Edit cells inline** and persist edits into `storyboardScript.rows` and canonical JSON.
10. **Export CSV** using upstream CSV serialization.
11. **Use fullscreen mode** for focused editing and review.
12. **Surface loading / generation state** through upstream overlay and task UI.

### 6.3 Storyboard Script Columns

Upstream defines these display columns:

| Key | Label | Product meaning |
| --- | --- | --- |
| `??` | ?? | Shot number / order |
| `??` | ?? | Shot duration |
| `??` | ?? | Shot size / framing |
| `??` | ?? | Scene / location |
| `????` | ???? | Visual description |
| `??` | ?? | Character names |
| `????` | ???? | Character appearance or identity |
| `????` | ???? | Character action |
| `??` | ?? | Emotional tone |
| `???` | ??? | Character reference image |
| `??` | ?? | General visual reference |
| `?????` | ????? | Prompt for image generation |
| `?????` | ????? | Prompt for video generation |
| `??` | ?? | Dialogue |
| `??` | ?? | Sound design notes |

Product rule: these column keys are upstream schema keys. Do not rename them to local English fields unless upstream already maps aliases during normalization.

### 6.4 Storyboard Script Data Model

Upstream `createStoryboardScriptNodeData()` defines this default baseline:

```json
{
  "type": "storyboard-script",
  "width": 1024,
  "height": 576,
  "resizeMinWidth": 1024,
  "resizeMinHeight": 576,
  "name": "????",
  "storyboardScript": {
    "version": 1,
    "viewMode": "list",
    "mediaMode": "image",
    "rawJson": "",
    "canonicalJson": "{ ... storyboard-script.v1 ... }",
    "rows": [],
    "title": "????",
    "detectedIntent": { "shotCount": 0 },
    "selectedRowIndexes": [],
    "selectionMode": false
  }
}
```

Canonical JSON schema:

```json
{
  "schemaVersion": "storyboard-script.v1",
  "title": "????",
  "detectedIntent": {
    "shotCount": 0
  },
  "rows": []
}
```

### 6.5 Storyboard Script State Rules

| State | Valid values | Product behavior |
| --- | --- | --- |
| `viewMode` | Upstream-normalized modes, default `list` | Controls list/table/card-like presentation according to upstream UI |
| `mediaMode` | Upstream-normalized modes, default `image` | Controls whether image or video prompt workflow is emphasized |
| `rawJson` | String | Stores raw model output when available |
| `canonicalJson` | Stringified `storyboard-script.v1` JSON | Stores normalized structured output |
| `rows` | Array of row objects | Editable shot rows |
| `title` | String | User-visible script title |
| `detectedIntent.shotCount` | Number | Desired / detected shot count |
| `selectedRowIndexes` | Number array | Row selection for targeted operations |
| `selectionMode` | Boolean | Enables row-selection UI |

### 6.6 Storyboard Script Interaction Flow

#### Flow A: Create Empty Storyboard Script

1. User opens add-node menu or context add menu.
2. User selects `????`.
3. Canvas creates `storyboard-script` via upstream `createStoryboardScriptNodeData()`.
4. Node renders empty state with upstream CSS.
5. User can enter prompt text, switch modes, or connect media context.

#### Flow B: Create From Video Toolbar

1. User selects or hovers a `source-video` or `ai-video` node.
2. Video toolbar shows `????` action using upstream toolbar icon.
3. User clicks the action.
4. Upstream `createConnectedStoryboardScriptNode()` creates a `storyboard-script` node near the video node.
5. Canvas adds an edge from video source to Storyboard Script target.
6. Storyboard Script can use video context for generation.

#### Flow C: Generate Script From Text / Image / Video

1. User provides text prompt or connects source media.
2. Node builds prompt using upstream `storyboardScriptGeneration.js`:
   - text-only prompt for pure text input,
   - image prompt for image reference input,
   - video prompt for video reference input.
3. Node calls existing AI text / task runtime services through upstream component logic.
4. Model response is normalized into `storyboardScript.rows` and `canonicalJson`.
5. Node shows generation state while pending and renders rows when complete.

#### Flow D: Edit and Review Rows

1. User clicks a row/cell.
2. Inline editor updates the selected field.
3. Node persists edited row data.
4. Canonical JSON and CSV export reflect edited values.
5. Fullscreen mode can be used for larger review.

#### Flow E: Select Rows for Downstream Work

1. User enables selection mode or uses select-all.
2. User selects one or more rows.
3. `selectedRowIndexes` is normalized and persisted.
4. Downstream image/video prompt operations should use selected rows when upstream node behavior supports row-scoped actions.
5. If no row is selected, row-scoped operations fall back to all rows only when upstream behavior does so.

### 6.7 Storyboard Script Non-Goals

- Do not replace existing `storyboard` node.
- Do not merge with `storyboard_director` assistant skill.
- Do not introduce a custom materialization engine unless upstream Storyboard node lacks required downstream behavior and a gap is recorded.
- Do not automatically queue video generation from assistant or group execution as part of this migration.
- Do not create provider-level execution orchestration in this scope.

---

## 7. Assistant Skill Boundary

Existing file remains separate:

- `config\assistant-skills\storyboard_director.json`

Product boundary:

- `storyboard_director` remains an assistant planning strategy.
- `storyboard-script` is a canvas node type with upstream UI and data.
- The migration must not alias `storyboard_director` to `storyboard-script`.
- Any future bridge between assistant strategy output and Storyboard Script node creation requires a separate product decision.

---

## 8. Group Run / Selected Run Boundary

Group run and selected-node run are excluded from this product scope by default.

They can enter scope only if all conditions are met:

1. A Director or Storyboard upstream interaction cannot work without that behavior.
2. The exact upstream dependency is identified.
3. The implementation uses upstream `groupExecution.js` button-click semantics first.
4. A local custom execution engine is not introduced without a separate upstream-gap decision and user approval.

Current product decision: do not implement group run / selected run in the baseline migration.

---

## 9. Data Persistence and Compatibility

### 9.1 Project Persistence

- New nodes persist in the existing canvas node dictionary like other node types.
- Director node persists `sceneNode` field.
- 360 panorama node persists `panorama360Node` field.
- Storyboard Script node persists `storyboardScript` field.
- Existing `storyboard` nodes remain unchanged.

### 9.2 Backward Compatibility

- Existing projects with `panorama-scene` must still open.
- Existing projects with `panorama-360` must still open.
- Existing projects with `storyboard` must still open.
- New `storyboard-script` nodes must not be normalized into `storyboard`.
- `storyboard_script` alias may normalize to `storyboard-script` only if upstream metadata uses that alias.

### 9.3 File and Media References

Director:

- Panorama image references use upstream `localPath`, `imageUrl`, `fileName`, `sourceSignature`, `isLoaded`, and `error` fields.
- Capture creates source image data through existing Huanying media/file services adapted from upstream.

Storyboard Script:

- Image and video references are interpreted by upstream component logic and supporting services.
- `???` and `??` columns can store reference image/media values according to upstream node behavior.
- Video-frame analysis uses upstream `storyboardVideoFrameApi.js` when migrated.

---

## 10. Entry and Navigation Requirements

| Surface | Director | Storyboard Script | Notes |
| --- | --- | --- | --- |
| Left add-node menu | Show `3D???` if this menu is active | Show `????` if this menu is active | Keep sibling button structure valid |
| Hover add-node picker | Show `3D???` | Show `????` | No dev-mode gate for product entries |
| Canvas context menu | Add `3D???` | Add `????` | Use upstream factory data |
| Side-plus connection | Keep panorama behavior | Add upstream Storyboard Script target behavior where upstream supports it | Do not break existing media node connections |
| Video toolbar | Not applicable | Add `????` action | Only for video node source action |

---

## 11. Visual and UX Requirements

### 11.1 Director Styling

Use upstream styles:

- `styles\panorama-scene-node.css`
- `styles\panorama-scene-toolbar.css`
- `styles\panorama-scene-popover.css`

No local restyling is allowed unless it is a path/loading fix or documented conflict with existing Huanying layout.

### 11.2 Storyboard Script Styling

Use upstream style:

- `styles\storyboard-script-node.css`

The CSS must support:

- empty state,
- header controls,
- view switch,
- media switch,
- row/card/table surfaces,
- selected rows,
- role/reference image cells,
- loading overlay,
- fullscreen overlay,
- toolbar styling.

---

## 12. Acceptance Criteria

### 12.1 Director Acceptance

- `3D???` is visible in active add-node surfaces without dev-mode dependency.
- Creating it produces a node with `type: "panorama-scene"`.
- Default name is `3D???`.
- Default size is `1024 x 576`.
- Node renders with `PanoramaSceneNode`.
- Existing `panorama-scene` project data still opens.
- Upstream panorama CSS is loaded.
- No new Director-only custom node type exists.

### 12.2 Storyboard Script Acceptance

- `????` is visible in active add-node surfaces.
- Creating it produces a node with `type: "storyboard-script"`.
- New node data is produced by upstream `createStoryboardScriptNodeData()`.
- Node has `storyboardScript.version = 1`, default `viewMode = "list"`, default `mediaMode = "image"`, and `canonicalJson` schema `storyboard-script.v1`.
- Node renders with upstream `StoryboardScriptNode`.
- User can edit row/cell data and persist changes.
- User can switch display/media modes according to upstream UI.
- User can export CSV through upstream serialization.
- Video toolbar can create a connected Storyboard Script node where upstream action is migrated.
- Existing `storyboard` node and `storyboard_director` skill remain unchanged.

### 12.3 Scope Guard Acceptance

- No `canvasExecutionEngine` baseline file exists.
- No `groupRuntime` baseline file exists.
- No `workflow:execute-group` baseline event is introduced.
- `modules\groupExecution.js` is not added unless an implementation note proves it is a required dependency.

---

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Storyboard node dependency chain is deeper than expected | Runtime import failures | Copy/adapt upstream dependencies instead of stubbing them |
| Local files are minified/obfuscated | Patch errors in `main.js`, `interaction.js`, `EdgeController.js` | Use minimal patch points and syntax checks after each patch |
| Old `storyboard` confused with new `storyboard-script` | Broken existing projects or wrong node behavior | Preserve both types and add tests for separation |
| Assistant skill accidentally merged with node | Scope creep and unsafe generation behavior | Keep `storyboard_director.json` untouched and test separation |
| Director code already diverged locally | Overwriting could regress local runtime | Calibrate first; copy only missing styles or proven upstream deltas |
| Group execution pulled in by habit | Recreates previous non-upstream-first scope | Explicit non-goal and residue scan |

---

## 14. Review Fixes Integrated

This final product plan includes fixes from the product review pass:

- Scope gate added for group run / selected-node run.
- Exact upstream data defaults added for `panorama-scene` and `storyboard-script`.
- `storyboard`, `storyboard-script`, and `storyboard_director` separation made explicit.
- CSS source-of-truth requirements added to prevent local restyling.
- Acceptance criteria now include scope guards against the previous custom execution-engine approach.
