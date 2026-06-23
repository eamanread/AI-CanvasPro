# Huanying UI Design System Specification

Date: 2026-06-10
Design direction: Dark Creative Workbench
Implementation mode: native HTML, CSS, and JavaScript. No framework migration.

## 1. System Goal

Create a durable interface system for Huanying as a professional AI creative workbench. The design system must reduce one-off CSS, unify node behavior, protect canvas performance, and make generation states legible.

This is not a marketing-site system. It is a dense application system for long creative sessions.

## 2. Visual Personality

- Professional, calm, technical, and creator-focused.
- More like a media workstation than a chat app.
- Dark mode first, light mode supported.
- Minimal glow, no generic AI purple-blue gradients as default decoration.
- Compact controls, high state clarity, strong hierarchy.
- Visual texture should be subtle and fixed, never attached to zooming or scrolling content.

## 3. Token Architecture

The current token base should be preserved, then governed through semantic tokens.

### 3.1 Primitive Tokens

Primitive tokens are raw values. They can remain in the codebase, but new component code should rarely use them directly.

Examples:

```css
--color-zinc-980: #080809;
--color-zinc-950: #0d0e11;
--color-zinc-900: #14161b;
--color-zinc-850: #1b1e25;
--color-zinc-800: #242832;
--color-white: #ffffff;
--color-blue-500: #3b82f6;
--color-cyan-500: #06b6d4;
--radius-8: 8px;
--radius-12: 12px;
--radius-16: 16px;
--space-8: 8px;
--space-12: 12px;
--space-16: 16px;
--duration-fast: 120ms;
--duration-base: 180ms;
--duration-panel: 240ms;
```

### 3.2 Semantic Tokens

Semantic tokens describe purpose.

```css
--surface-canvas: var(--color-zinc-980);
--surface-app-shell: rgba(15, 17, 22, 0.82);
--surface-panel: rgba(20, 23, 30, 0.94);
--surface-panel-solid: #151820;
--surface-node: rgba(255, 255, 255, 0.045);
--surface-node-elevated: rgba(255, 255, 255, 0.065);
--surface-popover: rgba(18, 21, 28, 0.96);
--surface-input: rgba(255, 255, 255, 0.06);

--text-primary: rgba(255, 255, 255, 0.92);
--text-secondary: rgba(255, 255, 255, 0.68);
--text-muted: rgba(255, 255, 255, 0.48);
--text-disabled: rgba(255, 255, 255, 0.30);

--border-subtle: rgba(255, 255, 255, 0.07);
--border-default: rgba(255, 255, 255, 0.10);
--border-strong: rgba(255, 255, 255, 0.16);
--border-focus: rgba(90, 150, 255, 0.78);

--accent-primary: #5a96ff;
--accent-primary-soft: rgba(90, 150, 255, 0.14);
--accent-primary-border: rgba(90, 150, 255, 0.36);

--state-success: #22c98b;
--state-warning: #f4b740;
--state-danger: #f05b5b;
--state-running: var(--accent-primary);
```

### 3.3 Component Tokens

Component tokens map surfaces to actual UI.

```css
--node-bg: var(--surface-node);
--node-bg-hover: var(--surface-node-elevated);
--node-border: var(--border-default);
--node-border-selected: var(--accent-primary-border);
--node-radius: var(--radius-16);
--node-shadow: 0 18px 60px rgba(0, 0, 0, 0.32);

--toolbar-bg: rgba(18, 21, 28, 0.88);
--toolbar-border: var(--border-default);
--toolbar-radius: var(--radius-14);

--field-bg: var(--surface-input);
--field-border: var(--border-default);
--field-border-focus: var(--border-focus);

--popover-bg: var(--surface-popover);
--popover-border: var(--border-default);
--popover-shadow: 0 20px 70px rgba(0, 0, 0, 0.50);
```

## 4. Color Rules

- Use one primary accent for selection, active state, focus, and running state.
- Use semantic colors only for success, warning, danger, and provider identity.
- Avoid decorative purple-blue gradients. Existing purple tokens can remain for backward compatibility, but new work should not use purple as the default focus or glow color.
- Do not use pure black or pure white for large surfaces. Reserve pure white for icons or text only where contrast requires it.
- Light mode must map the same semantic roles, not invert raw primitive names like `--white` becoming black.

## 5. Typography

### 5.1 Font Direction

Recommended stack:

```css
--font-ui: "Geist", "Satoshi", "Cabinet Grotesk", "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
```

Implementation guidance:

- Remove production dependence on remote Google Fonts over time.
- Self-host the chosen UI font or use a local-first fallback.
- Use mono for task ids, ratios, frame counts, numeric counters, technical logs, and model metadata.

### 5.2 Type Scale

```css
--type-caption: 11px;
--type-meta: 12px;
--type-body: 13px;
--type-body-lg: 14px;
--type-title: 15px;
--type-panel-title: 16px;
--type-display-sm: 20px;
--type-display-md: 24px;
```

Rules:

- Dense tool UI uses 12px to 14px for most controls.
- Panel titles use 15px to 16px with medium weight.
- Avoid all-caps labels everywhere. Use sentence case for most labels.
- Use tabular numbers for generation counts, frame counts, zoom percentages, and task metrics.

## 6. Radius System

Use a consistent system:

- Inputs and small buttons: 8px to 10px.
- Toolbar buttons: 10px to 12px.
- Nodes: 14px to 16px.
- Panels and modals: 18px to 22px.
- Pills: 999px only for status chips, compact toggles, and avatar-like objects.

Do not mix square, soft, and pill styles without a documented component rule.

## 7. Elevation and Layering

### 7.1 Elevation

- Canvas grid: no elevation.
- Nodes: subtle elevation only when selected, dragged, or floating above canvas.
- Panels: stronger surface separation than nodes.
- Popovers: strongest shadow and border.
- Modals: overlay dim plus focused panel.

### 7.2 Z-index Scale

Define and use named layers:

```css
--z-canvas: 0;
--z-node: 10;
--z-connection: 20;
--z-node-toolbar: 100;
--z-canvas-controls: 200;
--z-popover: 500;
--z-assistant: 700;
--z-modal: 900;
--z-toast: 1000;
--z-critical-alert: 1100;
```

New CSS should not use arbitrary `9999` values.

## 8. Motion System

### 8.1 Timing

```css
--ease-standard: cubic-bezier(0.16, 1, 0.3, 1);
--ease-exit: cubic-bezier(0.7, 0, 0.84, 0);
--duration-hover: 120ms;
--duration-control: 160ms;
--duration-popover: 180ms;
--duration-panel: 240ms;
```

### 8.2 Allowed Motion

- Hover: color, border, background, opacity, transform.
- Pressed: `translateY(1px)` or `scale(0.98)`.
- Popover: opacity plus small translate or scale.
- Loading: compact shimmer or progress band.
- Node selection: border and shadow transition.

### 8.3 Banned Motion for Core Canvas

- Animating `top`, `left`, `width`, or `height`.
- Blur animation on many nodes.
- Heavy shadows during pan or zoom.
- Infinite decorative loops on the canvas.
- Motion that ignores `prefers-reduced-motion`.

## 9. Component Contracts

### 9.1 Button

States:

- default
- hover
- active
- focus-visible
- disabled
- loading
- destructive
- selected

Required behavior:

- Every button has accessible text or `aria-label`.
- Disabled buttons should explain why through tooltip or adjacent helper text when the reason is not obvious.
- Primary action is reserved for generation, save, confirm, or apply operations.

### 9.2 Icon Button

Rules:

- Standard sizes: 28px, 32px, 36px.
- Icon stroke widths should be consistent by area.
- Tooltip required when label is hidden.
- Active state must differ from hover state.

### 9.3 Field

Required anatomy:

- label
- input or textarea
- helper text if needed
- error text if invalid
- focus-visible state
- disabled state

Prompt textareas can have custom layout, but must still expose label and status to assistive technology.

### 9.4 Popover

Rules:

- Uses z-index token.
- Closes on Escape and outside click.
- Returns focus to trigger when closed.
- Has max viewport size and scroll behavior.
- Does not rely on blur alone for separation.

### 9.5 Modal

Rules:

- Focus trapped while open.
- Escape behavior defined.
- Primary and secondary actions aligned consistently.
- Destructive actions require confirmation copy.
- Overlay and panel z-index use tokens.

### 9.6 Toast

Rules:

- Short and actionable.
- No vague "Oops" copy.
- Error toasts should include retry or inspect if relevant.
- Long-running generation state should not live only in toast.

## 10. Node Anatomy

Every main node should map to this structure:

```text
Node Shell
  Header
    Type icon
    Editable or readable title
    Model or provider metadata
    Status chip
    Quick actions

  Body
    Prompt, input, preview, table, waveform, or scene viewport

  Parameter Surface
    Model, ratio, seed, batch, reference mode, and advanced controls

  Result Surface
    Generated media, text output, storyboard rows, audio clip, or scene preview

  Footer
    References, task state, secondary actions
```

### 10.1 Node States

Required state map:

- idle
- hovered
- selected
- editing
- connecting-source
- connecting-target
- queued
- running
- succeeded
- failed
- disabled
- stale
- missing-provider
- missing-reference

### 10.2 Node Type Accent

Use type accent sparingly:

- Text: blue or neutral accent.
- Image: cyan or blue-cyan accent.
- Video: indigo only when distinct from primary accent.
- Audio: green or teal only when needed.
- Storyboard: amber or calibrated violet only if necessary.
- Panorama: neutral technical accent.

Type accent should not override selected, focus, error, or running semantics.

## 11. Prompt and Model System

### 11.1 Prompt Panel States

- draft: text can be edited.
- ready: submit available.
- blocked: required model, provider, prompt, or reference missing.
- queued: task accepted but not running.
- running: generation in progress.
- stopping: cancellation requested.
- failed: error visible and retry available.
- succeeded: result available and reusable.

### 11.2 Model Selector Contract

Show:

- provider
- model display name
- configured or unconfigured state
- deleted model state
- required subscription or auth state
- current source if pulled from registry

Never hide broken model state behind a generic disabled button.

### 11.3 Reference Bar Contract

Each reference should communicate:

- source type: text, image, video, audio, storyboard, or upload
- source title or short label
- thumbnail or type glyph
- missing or pending state
- remove action
- hover preview when meaningful

## 12. Generation State System

Canonical states:

```text
draft
ready
queued
uploading
running
polling
post-processing
succeeded
failed
cancelled
expired
```

Each state must define:

- label
- color
- icon or glyph
- allowed actions
- node visual treatment
- assistant card treatment
- toast treatment

Recommended mappings:

- queued: muted accent border, queue label.
- uploading: progress label, upload icon.
- running: primary accent, compact animated progress.
- polling: primary accent, subdued pulse.
- post-processing: neutral accent, processing label.
- succeeded: success color only in small status area.
- failed: danger border and inline error copy.
- cancelled: muted label with retry when valid.
- expired: warning label with regenerate option.

## 13. Assistant Card System

Assistant UI should have card types:

1. Message card: conversational text.
2. Action preview card: planned canvas changes.
3. Confirmation card: requires user decision.
4. Execution card: active task, steps, progress, cancel.
5. Trace card: expandable technical record.
6. Result card: output, apply action, inspect action.
7. Error card: failure reason, retry, copy details.

Rules:

- Assistant suggestions and executed actions must look different.
- Action preview must summarize affected nodes and edges.
- High-risk actions require explicit confirmation.
- Errors must be specific and recoverable.

## 14. Empty, Loading, and Error States

### Empty Canvas

Should offer:

- create text node
- create image node
- create video node
- import asset or project
- open assistant

The empty state should be calm and functional, not decorative.

### Loading

Use skeletons or state-specific placeholders, not generic spinner-only UI.

### Error

Use direct language:

- "Connection failed. Restart the local server and retry."
- "Model is not configured. Choose a configured model."
- "Reference file is missing. Remove it or relink the asset."

## 15. Accessibility Rules

- All controls with icon-only UI need labels.
- `focus-visible` is required globally.
- Escape closes popovers and modals where safe.
- Modal focus is trapped and restored.
- Color cannot be the only state indicator.
- Reduced motion is honored.
- Meaningful images need alt text.
- Toolbar and menu items need keyboard navigation contracts.

## 16. Performance Rules

- Pan, zoom, drag, selection, and connection interactions have priority over visual effects.
- Disable or reduce node shadows during `body.is-panning`, `body.is-zooming`, and viewport animations.
- Avoid `backdrop-filter` on repeated node cards.
- Use `transform` and `opacity` for animations.
- Do not animate layout properties.
- Do not attach grain overlays to canvas content.
- Lazy-load large previews where possible.

## 17. CSS Migration Rules

- Keep existing CSS working while adding semantic token layers.
- Do not delete old tokens until all dependent selectors are audited.
- New styles should go into named surface sections or files.
- Avoid adding new raw color values inside component selectors.
- Avoid adding new arbitrary z-index values.
- Prefer a small set of reusable classes over per-node overrides.

## 18. Banned Patterns

- Generic AI purple glow as default decoration.
- Three equal card layouts for core product surfaces.
- Heavy blur or glow on canvas nodes.
- Spinner-only loading for generation tasks.
- Hidden focus outlines without replacement.
- Arbitrary `z-index:9999` escalation.
- Placeholder labels instead of real form labels.
- Assistant actions that mutate canvas without preview.
- One-off button styles for each feature.
- New CSS appended without product-surface ownership.
