# Storyboard Script Reference Thumbnail Parity Fix

> Status: obsolete. This was the wrong implementation direction.

## Why Obsolete

The user review explicitly rejected adding a Storyboard-only text-thumbnail DOM hack. Storyboard Script should not clone Generate Text reference-thumbnail DOM. It should keep the upstream Storyboard Script body and use the shared reference bar.

Do not implement or restore:

- Storyboard-only text reference thumbnail normalization
- `TXT` SVG injection
- `draggable` / `data-type="text"` / `data-label` / `data-index` assertions for Storyboard text refs
- private `_renderRefBar` wrapper hacks

## Replacement Plan

Use `2026-06-09-storyboard-script-upstream-first-redo.md`.
