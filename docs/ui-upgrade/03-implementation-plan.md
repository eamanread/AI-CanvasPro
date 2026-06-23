# Huanying UI Upgrade Implementation Plan

Date: 2026-06-10
Scope: Phase 0 through Phase 8 UI and interaction upgrade plan.
Mode: staged, testable, no framework migration.

## Guiding Strategy

Use a design-system-first migration. Keep the existing native HTML, CSS, and JavaScript architecture. Do not rewrite the app or migrate to React, Next.js, Tailwind, or a third-party UI framework. Upgrade the existing workbench by adding governed tokens, component contracts, state contracts, and surface-by-surface improvements.

Primary objective: improve the core creative loop without breaking existing behavior.

## Working Constraints

- The current git worktree contains many unrelated modifications. UI implementation must happen in an isolated branch or worktree.
- Do not overwrite existing uncommitted changes.
- CodeGraph was locked during the initial audit. Use direct reads until the index is available again.
- Some files are minified or obfuscated. Avoid deep rewrites of generated or upstream-sensitive files unless source ownership is confirmed.
- Preserve local-server and Windows packaging behavior.
- Run tests after each implementation phase.

## Phase 0: Freeze, Baseline, and Safety Setup

Status: planned
Priority: P0

### Goals

- Protect existing work.
- Establish a visual and test baseline.
- Identify the exact UI surfaces to touch first.

### Tasks

1. Create an isolated UI upgrade branch or worktree.
2. Record current git status and unrelated dirty files.
3. Run the existing test suite or the smallest reliable baseline tests.
4. Start the app locally at `http://localhost:8777`.
5. Capture baseline screenshots for:
   - empty canvas
   - app shell with project dropdown
   - add-node menu
   - settings overlay
   - image node
   - text node
   - video node
   - assistant panel
   - prompt panel with references
   - error or disconnect state
6. Save screenshots under `docs/ui-upgrade/baseline-screens/` or another agreed artifact folder.
7. Document known current failures separately from UI upgrade failures.

### Likely files touched

- Documentation and screenshot artifacts only.

### Acceptance criteria

- Baseline screenshots exist.
- Current test status is recorded.
- Dirty worktree risks are documented.
- No product implementation code changed.

## Phase 1: Audit Completion and Design System Lock

Status: planned
Priority: P0

### Goals

- Convert initial audit into implementation-ready rules.
- Lock product personality, token naming, state maps, and surface ownership.

### Tasks

1. Review `docs/ui-upgrade/00-product-read.md`.
2. Review `docs/ui-upgrade/01-audit.md`.
3. Review `docs/ui-upgrade/02-design-system.md`.
4. Decide the primary accent color and font strategy.
5. Define the initial z-index scale.
6. Define node state names and generation state names.
7. Identify first target surface for implementation.

### Likely files touched

- `docs/ui-upgrade/00-product-read.md`
- `docs/ui-upgrade/01-audit.md`
- `docs/ui-upgrade/02-design-system.md`
- `docs/ui-upgrade/03-implementation-plan.md`

### Acceptance criteria

- Product direction is approved.
- Token and state vocabulary is approved.
- Phase 2 target files are confirmed.

## Phase 2: Semantic Tokens and Global Interaction Primitives

Status: planned
Priority: P0

### Goals

- Add a governed semantic token layer without breaking existing visuals.
- Standardize focus, button, field, panel, popover, and z-index basics.

### Tasks

1. Add or reorganize semantic tokens on top of existing variables.
2. Add z-index variables.
3. Add global `focus-visible` rules.
4. Add reduced-motion rules.
5. Add base `.ui-button`, `.ui-icon-button`, `.ui-field`, `.ui-panel`, `.ui-popover`, `.ui-status` class contracts.
6. Map a small number of existing controls to primitives as a pilot.
7. Add contract tests for token presence and class state names.

### Likely files touched

- `style.css`
- `styles/variables.css`
- possibly new `styles/ui-tokens.css`
- possibly new `styles/ui-primitives.css`
- `index.html` if new CSS files are linked
- new test files for CSS contract if suitable

### Acceptance criteria

- Existing app still renders.
- No arbitrary new raw colors are introduced in pilot selectors.
- Focus-visible is visible on keyboard navigation.
- Reduced motion disables or simplifies nonessential transitions.
- No canvas performance regression observed in baseline screens.

## Phase 3: App Shell and Canvas Workspace

Status: planned
Priority: P0

### Goals

- Improve first impression and core workspace clarity.
- Make canvas controls, side actions, empty state, selection, and connection feedback consistent.

### Tasks

1. Upgrade header hierarchy: logo, project name, tabs, global status.
2. Standardize sidebar icon button states.
3. Improve project dropdown as a popover surface.
4. Upgrade empty canvas as a functional starter state.
5. Standardize minimap and zoom control styling.
6. Normalize add-node menu and context menu states.
7. Add explicit pan, zoom, drag, selection, and connection visual contracts.
8. Verify performance with many nodes.

### Likely files touched

- `index.html`
- `style.css`
- `styles/layout.css`
- `styles/node-base.css`
- `modules/app/appTopbarAndConfig.js`
- `modules/app/appPanels.js`
- `modules/interaction/DragController.js`
- `modules/interaction/EdgeController.js`
- `modules/interaction/SelectionController.js`
- `modules/interaction/ZoomController.js`

### Acceptance criteria

- App shell status is readable.
- Sidebar has consistent hover, active, disabled, and focus states.
- Empty canvas offers clear next actions.
- Canvas pan and zoom remain smooth.
- Context menu and node menu match popover contract.

## Phase 4: Node System Unification

Status: planned
Priority: P0

### Goals

- Make all node types feel like one product system.
- Standardize node anatomy and generation state display.

### Tasks

1. Define shared node shell classes.
2. Standardize node header, title, type icon, status chip, and quick actions.
3. Standardize selected, hover, running, failed, and stale states.
4. Align node toolbar button styles.
5. Pilot on two high-value nodes: text and image.
6. Extend to video and audio.
7. Extend to storyboard and panorama after preserving feature-specific layouts.
8. Add visual and contract tests for node states.

### Likely files touched

- `styles/node-base.css`
- `styles/node-types.css`
- `styles/storyboard-script-node.css`
- `styles/panorama-scene-node.css`
- `styles/panorama-scene-toolbar.css`
- `components/AIGenTextNode.js`
- `components/AIGenerateNode.js`
- `components/AIGenVideoNode.js`
- `components/AIGenAudioNode.js`
- `components/StoryboardScriptNode.js`
- `components/PanoramaSceneNode.js`
- `components/nodeToolbar/buttonFactory.js`

### Acceptance criteria

- Text, image, video, audio, storyboard, and panorama nodes share recognizable anatomy.
- Node selected state is stronger than hover state.
- Node running and failed states are consistent across node types.
- Toolbar buttons use one interaction contract.
- Node-specific features remain intact.

## Phase 5: Prompt, Model, Reference, and Generation Submit System

Status: planned
Priority: P0

### Goals

- Make AI generation setup consistent across node types.
- Clarify blocked, ready, running, failed, retryable, and stopping states.

### Tasks

1. Define prompt panel class contract.
2. Standardize prompt textarea, negative prompt, upload slots, and reference bar.
3. Standardize model selector trigger and menu states.
4. Show unconfigured, deleted, unavailable, subscription-required, and provider-error states.
5. Normalize submit button states.
6. Normalize advanced-panel disclosure.
7. Add retry and error copy patterns.
8. Add tests for model selector and submit state.

### Likely files touched

- `components/sharedPromptPanel.js`
- `components/shared/nodeModelMenu.js`
- `components/aigenImage/modelRegistryRuntime.js`
- `components/aigenText/modelRegistryRuntime.js`
- `components/aigenImage/uiModule.js`
- `components/aigenText/uiModule.js`
- `components/video-node/referenceInputModule.js`
- `styles/v2.css`
- `style.css`
- relevant tests in `components/aigenImage/` and `components/aigenText/`

### Acceptance criteria

- Prompt panels share layout and state behavior.
- Model selector states are clear and consistent.
- References show source type and missing state.
- Submit button never appears ready when required data is missing.
- Running and stopping states are understandable.

## Phase 6: Assistant and Skill Execution Surface

Status: planned
Priority: P1

### Goals

- Upgrade assistant from generic chat surface into a canvas copilot surface.
- Distinguish advice, action preview, confirmation, execution, trace, result, and error.

### Tasks

1. Define assistant card taxonomy.
2. Style message cards separately from action cards.
3. Add clear action preview summary style.
4. Add confirmation card style for high-risk operations.
5. Add execution progress card style.
6. Add trace card collapsed and expanded states.
7. Add error card with retry, copy, and inspect actions.
8. Add tests around action preview and execution UI contracts.

### Likely files touched

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.p1Ui.test.js`
- `modules/assistant/assistantActionPreview.js`
- `modules/assistant/assistantActionPreviewModel.js`
- `modules/assistant/canvasSkills/tracing/skillTraceCards.js`
- `modules/assistant/assistantExecutionStore.js`
- `style.css` or a new assistant CSS surface file

### Acceptance criteria

- Suggestions and executed actions are visually distinct.
- High-risk actions require clear confirmation.
- Execution progress can be scanned quickly.
- Errors include next actions.
- Assistant visual changes do not alter action semantics.

## Phase 7: Asset, Result, Preview, and Reuse Surface

Status: planned
Priority: P1

### Goals

- Make generated results feel reusable and durable.
- Improve asset and reference continuity.

### Tasks

1. Define result preview action bar.
2. Standardize actions: preview, reuse as reference, branch, download, copy path, reveal asset.
3. Improve reference thumbnail type language.
4. Add missing asset and pending asset states.
5. Improve hover preview material and performance.
6. Add tests for reference state rendering where seams exist.

### Likely files touched

- `modules/AssetManager.js`
- `modules/assetCustomTags.js`
- `components/video-node/resultRenderModule.js`
- `components/video-node/previewControlsModule.js`
- `services/thumbnailCacheService.js`
- `styles/v2.css`
- `style.css`
- node result render modules per type

### Acceptance criteria

- Results have consistent reuse actions.
- Missing local files are clearly communicated.
- Reference thumbnails are type-consistent.
- Hover previews do not harm canvas performance.

## Phase 8: Full Polish, Parity, Cleanup, and Release Readiness

Status: planned
Priority: P1 and P2

### Goals

- Validate the whole workbench.
- Remove redundant CSS where safe.
- Prepare a clean release-ready UI upgrade.

### Tasks

1. Compare before and after screenshots.
2. Validate dark theme and light theme.
3. Validate reduced motion.
4. Validate keyboard flows.
5. Validate large-canvas performance.
6. Remove obsolete CSS only when selectors are proven unused or replaced.
7. Document the design system and contribution rules.
8. Add release notes.

### Likely files touched

- touched CSS and component files from prior phases
- `docs/ui-upgrade/`
- possible release note or handoff document

### Acceptance criteria

- Main user loop works end to end.
- Tests pass or known unrelated failures are documented.
- Screenshots show consistent design language.
- No new arbitrary z-index, raw color, or focus-removal patterns are introduced.
- UI upgrade can be reviewed phase-by-phase.

## Suggested Test Matrix

### Node tests

- Text node idle, selected, prompt editing, running, failed, succeeded.
- Image node with one result, multiple results, upload reference, failed generation.
- Video node with reference input and result controls.
- Audio node with running and stop states.
- Storyboard node in table and card view.
- Panorama node with toolbar and popovers.

### Surface tests

- Empty canvas.
- Add-node menu.
- Context menu.
- Project dropdown.
- Settings overlay.
- Save dialog.
- Assistant panel with action preview.
- Assistant execution error.
- Asset hover preview.

### Accessibility tests

- Keyboard focus through header, sidebar, canvas controls, settings, modal, assistant.
- Escape closes popovers and modals.
- Reduced motion mode.
- Icon-only controls have labels.

### Performance tests

- 50 nodes, 200 nodes, and 500 nodes if fixture generation is available.
- Pan and zoom while assistant is open.
- Pan and zoom while generation states are active.
- Hover previews open and close.

## Rollback Strategy

- Keep each phase as a reviewable patch.
- Prefer additive semantic classes before deleting old classes.
- Use feature class gates when changing high-risk surfaces.
- Keep screenshots for visual comparison.
- If a phase regresses behavior, revert only that phase rather than the whole UI project.

## First Implementation Recommendation

Start with Phase 0 and Phase 1 only. Do not change product UI until baseline screenshots and the design system vocabulary are accepted. After approval, implement Phase 2 as the first code phase because tokens, focus states, z-index, and primitives unlock safer work on every later surface.
