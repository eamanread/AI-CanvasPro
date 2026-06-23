# Huanying UI and Interaction Audit

Date: 2026-06-10
Project root: `D:\Aic\huanying-source-windows-20260430-122116`
Mode: documentation-only audit. No implementation code was changed.

## Audit Inputs

Observed project structure:

- `index.html`: single-line minified HTML, 42,510 bytes, 150 element ids, 179 unique static classes.
- `main.js`: single-line bundled or obfuscated module entry, 41,279 bytes.
- `style.css`: single-line compiled stylesheet, 297,592 bytes, 434 variables, about 2,172 selectors, 46 keyframe declarations.
- `styles/`: additional CSS files: `variables.css`, `layout.css`, `node-base.css`, `node-types.css`, `settings.css`, `v2.css`, `storyboard-script-node.css`, and panorama-specific styles.
- `components/`: node components and shared prompt or toolbar helpers.
- `modules/app/`: app shell, assistant panel, panels, project lifecycle, topbar and config.
- `modules/interaction/`: drag, edge, selection, zoom, panorama interaction.
- `src/core/`: renderer, interaction, store, virtualization, runtime state.
- `services/` and `api/`: backend and API integration layers.

CodeGraph was unavailable during this audit because the database was locked, so this pass used direct file reads and shell inspection.

## High-level Findings

### A. The app already has a design-token foundation, but it is not governed enough

Evidence:

- `style.css` contains 434 CSS custom properties.
- `styles/variables.css` contains 345 CSS custom properties.
- There are dark and light theme sections in `style.css`.
- Many variables are primitive opacity tokens such as `--white-10`, `--black-70`, `--blue-40`, and direct component tokens such as `--shadow-toolbar`, `--about-dialog-bg`, `--preset-menu-bg`.

Issue:

The project has a large variable vocabulary, but components still appear to depend heavily on primitive color tokens and one-off component tokens. This makes theme consistency hard and encourages new overrides.

Impact:

- Visual changes become hard to reason about.
- Dark and light mode parity is fragile.
- Component states can drift across node types.
- It is easy to introduce another blue, purple, shadow, or radius without noticing.

Priority: P0

### B. Inter and Google Fonts are currently part of the product surface

Evidence:

- `index.html` loads Google Fonts Inter directly.
- Inter appears hundreds of times across CSS files.

Issue:

For a native local creative tool, loading a remote font undermines local reliability and adds a generic UI fingerprint. Inter can be acceptable for neutral software, but here it makes the product feel less distinctive and depends on a network font request.

Impact:

- Generic visual identity.
- Possible font loading instability.
- Harder to create a premium workbench identity.

Priority: P1

Recommended direction:

- Use a self-hosted or local-first font stack.
- Prefer `Geist`, `Satoshi`, `Cabinet Grotesk`, `IBM Plex Sans`, or a platform-neutral stack with stronger workbench personality.
- Use `JetBrains Mono` or `IBM Plex Mono` for numbers, task ids, ratios, and technical status.

### C. CSS architecture is partially modular, but the main stylesheet is still too dominant

Evidence:

- `style.css` is nearly 300KB and contains tokens, layout, node styles, prompt styles, toolbar styles, modal styles, state styles, and overrides.
- Additional CSS modules exist under `styles/`, but `style.css` still duplicates or overrides many areas.
- Several CSS files are minified to one line, which harms reviewability.

Issue:

The app is not without structure, but the structure is not yet enforceable. Future UI work can easily become append-only CSS.

Impact:

- Regression risk during visual changes.
- Difficult targeted reviews.
- Hard to delete old styles.
- Hard to define ownership by product surface.

Priority: P0

### D. Focus visibility and keyboard affordance need a stronger global standard

Evidence:

- CSS contains many `outline:0` occurrences.
- CSS contains comparatively few `focus-visible` rules.
- Static HTML has many buttons, menus, modals, and settings controls.
- JS modules use many event listeners and dynamic `innerHTML` or class changes.

Issue:

A dense creative workbench needs keyboard-accessible menus, popovers, nodes, toolbars, and dialogs. Current focus handling appears uneven across surfaces.

Impact:

- Keyboard users may get lost.
- Power users cannot rely on predictable focus.
- Modals and popovers may not communicate active state clearly.

Priority: P0

### E. Z-index values need governance

Evidence:

- `z-index:999` and `z-index:9999` appear many times across CSS.
- Multiple floating surfaces exist: sidebar, node menus, toolbars, settings overlay, save dialog, assistant, toast, hover previews, panorama popovers.

Issue:

Layering is product-critical in a canvas tool. Arbitrary z-index values cause hidden menus, blocked clicks, overlay conflicts, and fragile bug fixes.

Impact:

- UI collision between assistant, settings, context menus, toolbars, and previews.
- New popovers may require even larger z-index values.
- Hard to reason about modal priority.

Priority: P0

### F. Visual accent system is too broad for a coherent workbench

Evidence:

- Tokens include blue, cyan, purple, fuchsia, indigo, gold, green, red, group pink, group slate, and many related opacity variants.
- Brand gradients combine blue and purple.
- Many node and prompt states use blue, purple, indigo, and cyan variations.

Issue:

The current color language risks drifting into generic AI purple-blue glow. A professional creative workbench should use a narrow accent system and reserve secondary colors for semantic or provider-specific meaning.

Impact:

- Active, selected, connected, running, and provider states can look similar.
- Important warnings or errors may compete with decorative accent colors.
- The product identity becomes less specific.

Priority: P1

### G. Motion and visual effects need performance rules

Evidence:

- CSS contains hundreds of transitions and many keyframes.
- `backdrop-filter` and `box-shadow` are widely used.
- The app has explicit pan, zoom, viewport animation, and zoom-low body states, which is good.
- `requestAnimationFrame` and pointer events are used across renderer and interaction modules.

Issue:

The project already understands performance-sensitive canvas states, but UI polish work must not add heavy effects to nodes or scrolling containers.

Impact:

- Canvas pan and zoom may stutter under node load.
- Shadows and blur can multiply rendering cost across nodes.
- Animations can fight renderer virtualization.

Priority: P0

### H. Node system needs an explicit shared anatomy

Observed node files:

- `components/AIGenerateNode.js`
- `components/AIGenTextNode.js`
- `components/AIGenVideoNode.js`
- `components/AIGenAudioNode.js`
- `components/StoryboardScriptNode.js`
- `components/PanoramaSceneNode.js`
- source nodes and shared node toolbar modules

Issue:

The project has many node types and many node-specific CSS sections. Without a documented node anatomy, each node can independently define header, body, prompt, result, toolbar, status, and footer behavior.

Impact:

- Node types feel inconsistent.
- Model and prompt controls drift.
- Generated result actions are harder to discover.
- New nodes increase visual debt.

Priority: P0

### I. Prompt, model, and reference surfaces need unification

Observed related files:

- `components/sharedPromptPanel.js`
- `components/shared/nodeModelMenu.js`
- `components/aigenImage/modelRegistryRuntime.js`
- `components/aigenText/modelRegistryRuntime.js`
- `components/aigenImage/uiSchemaRenderer.js`
- `components/video-node/referenceInputModule.js`
- `styles/v2.css`
- `styles/storyboard-script-node.css`

Issue:

Prompt inputs, model triggers, reference bars, upload slots, advanced panels, and submit states are central to the product. They need one visual and interaction contract even if data paths differ by node type.

Impact:

- Users have to relearn controls by node type.
- Missing provider or deleted model states can be inconsistent.
- Submit button meaning can drift between ready, queued, running, stop, and retry.

Priority: P0

### J. Assistant panel is large enough to require its own UI system

Evidence:

- `modules/app/appAssistantPanel.js` is 167,429 bytes and 3,864 lines.
- It imports action executor, action contract, attachment store, context builder, execution API client, execution orchestrator, execution store, mention context, floating layer, model registry, skill state mapping, streaming client, typing effect, and skill trace modules.

Issue:

The assistant panel is no longer a simple chat surface. It is an operational UI for canvas actions, streaming, confirmations, skill execution, references, traces, and previews.

Impact:

- Chat-style UI alone will not explain action safety.
- Execution errors need structured cards.
- Users need to distinguish suggestions from committed changes.

Priority: P1

### K. Static HTML contains many inline SVG icons and inline styles

Evidence:

- `index.html` includes many inline SVG buttons and at least one inline style on the logo image.
- Several static icon buttons use directly embedded SVG stroke values.

Issue:

Inline SVGs are practical in a no-framework app, but without an icon contract they can drift in stroke width, size, hover state, and accessible labels.

Impact:

- Iconography feels inconsistent.
- Accessibility labels can be missed.
- The product becomes harder to theme.

Priority: P2

### L. HTML and CSS minification harms maintenance

Evidence:

- `index.html`, `main.js`, and many CSS files are single-line or heavily bundled.

Issue:

Minified source inside the editable repository makes UI review and targeted refactors difficult. Some files may be generated or protected by upstream migration constraints, so this must be handled carefully.

Impact:

- Hard to review diffs.
- Hard to attach precise line-level UI changes.
- Hard to run readable audits.

Priority: P1 for editable CSS and HTML, P2 for generated or upstream-sensitive JS.

## Surface Audit

### App Shell

Current elements:

- Header with logo, project name, canvas tabs, add canvas button.
- Floating sidebar with add, canvas project, assets, workflows, files, avatar, settings, tutorial, about.
- Server disconnect alert.
- Initial loader.

Issues:

- Global status hierarchy is weak. Server disconnect exists, but save state, provider state, queue state, and execution state need a coherent shell-level language.
- Sidebar icons need a consistent active, hover, disabled, and tooltip contract.
- Project dropdown should follow the same popover and command-surface rules as other floating layers.

Priority: P0 for status and focus, P1 for visual polish.

### Canvas Workspace

Current elements:

- `#v2-canvas`
- minimap wrapper, minimap, minimap viewport
- zoom controls and slider
- empty hint with quick node creation buttons
- context menu and add node menu
- grid and dots settings

Issues:

- Empty canvas should feel like a starting workspace, not a decorative welcome panel.
- Selection, connection, pan, zoom, minimap, and context menus need a shared state language.
- Canvas control cluster should be treated as an instrument panel with consistent button states.

Priority: P0

### Node System

Current elements:

- AI image, text, video, audio, storyboard, panorama, source, group, comment, debug, scene detection nodes.
- Node floating toolbars and side-plus behavior.
- Shared prompt panel and reference bars inside nodes.

Issues:

- Need common node anatomy and state map.
- Toolbar buttons need a shared contract.
- Node status and result actions need consistent placement.
- Type-specific accent should be calibrated, not a separate style system per node.

Priority: P0

### Prompt and Model Controls

Current elements:

- shared prompt panel
- model menu helpers
- registry runtimes
- upload/reference slots
- submit buttons
- advanced panels

Issues:

- Prompt controls should have one state contract: draft, ready, blocked, queued, running, stopping, failed, retryable.
- Model menus should show provider, availability, deleted state, and unconfigured state consistently.
- Reference bar should make source type and missing source obvious.

Priority: P0

### Settings and Modals

Current elements:

- Settings overlay with panes for general, canvas align, node behavior, file save, API input, subscription, shortcuts.
- Dreamina login modal.
- Save dialog.
- About dialog.

Issues:

- Settings already has a pane model, but it needs a stronger form, field, section, and validation contract.
- Modal layer order and focus behavior need standardization.
- Form labels, helper text, error text, and disabled states should be consistent.

Priority: P1

### Assistant and Skill Execution

Current elements:

- assistant autoload and large app assistant panel
- action preview model
- execution store and orchestrator
- skill trace cards
- confirmation policy
- streaming and typing effect

Issues:

- Needs separate visual types: message, action preview, confirmation, execution, trace, result, error.
- Needs impact summaries before canvas mutations.
- Needs copy, retry, cancel, apply, and inspect patterns.

Priority: P1

### Asset and Result Surfaces

Current elements:

- asset manager and custom tags
- reference thumbnails and hover preview
- media services and local file handling
- node result render modules

Issues:

- Generated results need consistent actions: preview, reuse as reference, branch into node, download, copy path, reveal in asset list.
- Missing local asset states need a clear visual pattern.
- Reference thumbnails need a shared type language.

Priority: P1

## Priority Summary

### P0: Stabilize and systematize first

- Establish semantic tokens on top of existing primitive variables.
- Define z-index scale.
- Define focus-visible and keyboard state rules.
- Define node anatomy and node state map.
- Define prompt/model/reference state contract.
- Guard pan, zoom, drag, and node virtualization performance.
- Add baseline screenshots and tests before visual changes.

### P1: Upgrade high-impact user surfaces

- App shell status and sidebar polish.
- Prompt and model selector parity.
- Assistant card system.
- Settings form consistency.
- Asset and result reuse actions.
- Font and typography system.
- Light theme parity.

### P2: Polish and differentiate

- Icon system cleanup.
- Subtle texture and materiality.
- Refined micro-motion.
- Onboarding and empty-state illustration direction.
- CSS readability and modular cleanup beyond touched areas.

## Risks

- Existing dirty worktree has many unrelated modifications. UI work must not overwrite them.
- Large single-line files make diffs hard.
- Some files appear bundled or obfuscated. Avoid deep rewrites unless source ownership is known.
- CSS variables are duplicated across files. Token cleanup must be incremental.
- Canvas performance can regress if blur, shadow, or animation are added to many nodes.
- Assistant UI changes can accidentally alter action execution semantics if visual and behavior changes are mixed.

## Recommended First Deliverables

- Product read: completed in `00-product-read.md`.
- UI audit: this document.
- Design system spec: `02-design-system.md`.
- Phase implementation plan: `03-implementation-plan.md`.
