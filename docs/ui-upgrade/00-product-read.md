# Huanying UI Upgrade Product Read

Date: 2026-06-10
Project: huanying-source-windows-20260430-122116
Scope: UI and interaction upgrade strategy for the existing native Web workbench.

## Design Read

Reading this as: a native Web AI multimodal infinite-canvas creative workbench for creators, AI workflow builders, and local-tool power users, with a professional dark productivity-tool language, leaning toward a Figma / ComfyUI / Runway / TouchDesigner style workbench rather than a marketing-site or dashboard aesthetic.

## Design Dials

- DESIGN_VARIANCE: 5
- MOTION_INTENSITY: 4
- VISUAL_DENSITY: 8

Rationale:

- DESIGN_VARIANCE 5 keeps the app recognizable as a serious creative tool while allowing enough distinction to avoid generic admin UI.
- MOTION_INTENSITY 4 gives interactions tactile polish without harming canvas pan, zoom, drag, and generation workflows.
- VISUAL_DENSITY 8 fits a production workbench with nodes, references, prompts, model controls, asset previews, assistant cards, and generation states.

## Product Identity

Huanying should feel like a professional creative operating system for AI media work. The strongest product promise is not simply "generate images or video". It is the ability to arrange multiple AI capabilities as a visible, reusable, editable graph.

The product should communicate:

- Control: users can see the workflow, references, tasks, and outputs.
- Continuity: every output can become the next input.
- Confidence: model state, task state, errors, retries, and save state are visible.
- Craft: the workbench feels intentionally designed for long creative sessions.
- Local reliability: the desktop-source workflow should feel stable even when providers fail.

## Core User Loop

The upgrade should optimize this loop first:

1. Start from an empty canvas or open a project.
2. Add text, image, video, audio, storyboard, or panorama nodes.
3. Connect nodes or reference upstream outputs.
4. Configure prompt, model, provider, ratio, batch, and advanced parameters.
5. Submit generation.
6. Read queued, running, failed, or completed state.
7. Preview the result.
8. Reuse the result as a reference, branch, download, or continue into another node.
9. Save the project.

Any UI improvement that does not make this loop clearer, faster, safer, or more pleasant should be lower priority.

## Primary Product Surfaces

### 1. App Shell

Includes the header, project name, canvas tabs, sidebar, project dropdown, settings entry, account avatar, and global status messages. The shell should answer: "Where am I, is the app connected, is the project saved, and what can I do next?"

### 2. Canvas Workspace

Includes the infinite canvas, grid, minimap, zoom controls, empty hint, drag, pan, selection, connection, and context menus. The canvas must remain visually quiet so nodes stay dominant.

### 3. Node System

Includes AI image, text, video, audio, storyboard, panorama, source, scene detection, comment, group, and debug nodes. Nodes are the primary objects of the product and should have a consistent anatomy with type-specific accents.

### 4. Prompt and Parameter Surface

Includes shared prompt panels, model selectors, reference bars, upload slots, advanced controls, batch controls, and submit buttons. This surface drives most successful generation outcomes.

### 5. Generation State System

Includes draft, ready, queued, uploading, running, polling, post-processing, succeeded, failed, cancelled, expired, and retry states. The current app has many generation pathways, so state language must be unified before visual polish.

### 6. Assistant and Skill Surface

Includes assistant panel, action previews, confirmation cards, execution traces, skill registry, generation context, and streaming output. It should feel like a canvas copilot, not a generic chat widget.

### 7. Asset and Result Surface

Includes asset manager, generated previews, reference thumbnails, hover previews, downloads, media controls, and local file state. Outputs need obvious reuse actions.

## UX Principles

- Canvas first: the canvas is the main stage. Shell and panels support it.
- State before decoration: every visual effect must clarify state, focus, hierarchy, or feedback.
- One accent system: use one primary accent for active and focus, with semantic colors only for success, warning, danger, and provider identity.
- Stable density: this is a dense tool. Do not create giant marketing whitespace inside core workflows.
- Progressive detail: show core controls first, hide advanced parameters behind stable disclosure.
- Reversible actions: assistant and batch actions should preview impact and allow cancel or retry.
- Keyboard visible: focus state is part of the visual system, not an accessibility afterthought.
- Performance guarded: pan, zoom, drag, and selection remain more important than blur, glow, or animation.

## Recommended Visual Direction

Name: Dark Creative Workbench

Attributes:

- Off-black canvas and graphite panels.
- Low-contrast hairline borders.
- Single cool accent, preferably blue-cyan or calibrated blue, not purple glow.
- Nodes with subtle material difference from panels.
- Toolbars as compact professional floating instruments.
- Prompt areas as high-clarity writing surfaces.
- Assistant cards as operational receipts and actions, not chat bubbles only.
- Subtle texture only in background or large surfaces, never on scrolling or zooming content.

## Non-goals

- Do not migrate the app to React, Next.js, Tailwind, or a third-party UI framework just for UI polish.
- Do not turn the workbench into a generic SaaS landing-page aesthetic.
- Do not apply Awwwards-style motion to the canvas.
- Do not rewrite all nodes at once.
- Do not replace existing generation logic or service APIs as part of UI work.
- Do not modify route, project file, provider, or generation behavior without separate product approval.

## Success Criteria

The upgrade succeeds when:

- A new user can identify add-node, project, settings, save, canvas controls, and generation state quickly.
- A power user can work longer without visual fatigue.
- Node states are consistent across image, text, video, audio, storyboard, and panorama nodes.
- Prompt and model controls feel like one system rather than per-node exceptions.
- Assistant actions are understandable before and after execution.
- Dark and light themes remain functional, with dark as the primary experience.
- Canvas performance remains stable under large node counts.
- New UI primitives reduce style duplication rather than adding more overrides.
