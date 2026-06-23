# Storyboard Script Model Selector And Text Reference Fix

> Status: superseded by `2026-06-09-storyboard-script-upstream-first-redo.md`.
> Keep this file only as an early investigation note. Do not implement the old text-thumbnail DOM parity direction.

## Original Goal

Make the Storyboard Script prompt-panel text model selector use the same registry selection and submit-time model mapping as Generate Text, while keeping Storyboard Script generation behavior.

## Superseded Points

The earlier plan drifted into making Storyboard Script text-reference thumbnails look like Generate Text DOM. That direction is no longer valid.

Do not reintroduce:

- `isStoryboardScriptTextReferenceNode`
- `renderStoryboardScriptTextRefThumb`
- `normalizeStoryboardScriptTextRefBar`
- private `_renderRefBar` wrapper / obfuscated key DOM normalization
- tests that require `draggable`, `data-type="text"`, `data-label`, `data-index`, or visible `TXT` for Storyboard text references

## Final Direction

Use the upstream-first redo plan instead:

- Keep the upstream Storyboard Script node body and behavior.
- Only connect text model selection and text model execution to Generate Text registry runtime.
- Use the shared ref bar for reference display.
- Verify text references by checking shared ref bar usage and prompt inclusion, not by DOM thumbnail cloning.
- Treat unconfigured/deleted registry models like Generate Text: notify and fail/stop instead of pretending a default model is usable.
