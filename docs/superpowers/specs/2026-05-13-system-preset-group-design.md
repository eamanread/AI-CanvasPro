# System Preset Group Creation Design

Date: 2026-05-13

## Goal

Add a first-class way to create system preset groups in the external preset manager, while keeping top-level system leaf presets valid.

The change must stay small and preserve the existing two preset sources:

- System presets: stored in preset definitions and may use `subItems`.
- Custom TXT presets: stored under `user/prompt/<nodeType>/*.txt` and remain flat.

## Confirmed Rules

- A top-level system item may be a group.
- A top-level system item may also be a leaf preset.
- Empty system groups are allowed.
- Empty groups should not open a second-level menu in the runtime preset picker.
- Existing top-level leaves are valid and must not be migrated, hidden, or blocked.
- The runtime preset picker should show at most three top-level entries before scrolling.

## UI Changes

The preset manager toolbar should become:

`Refresh` / `New System Group` / `New System Leaf` / `New TXT Preset`

`New System Group` creates a new top-level system group draft.

`New System Leaf` keeps the current behavior and creates a new top-level system leaf draft.

The existing lower action for adding a child preset to the selected group remains unchanged.

## Data Shape

New system groups save as top-level items:

```js
{
  title: "Group title",
  desc: "Optional description",
  subItems: []
}
```

New top-level system leaves continue to save as:

```js
{
  title: "Leaf title",
  desc: "Optional description",
  template: "Prompt template"
}
```

Second-level leaves continue to be appended to the selected group's `subItems`.

## Implementation Scope

Touch only the smallest relevant surface:

- `dev/preset-manager.html`
  - Add a `new-system-group-button` before the existing system leaf button.

- `dev/preset-manager.js`
  - Add a `createSystemGroupTarget()` helper.
  - Bind the new toolbar button.
  - Teach the save path to append a new top-level group with empty `subItems`.
  - Remove the current validation that blocks groups with zero children.
  - Keep top-level leaf creation behavior intact.

- `modules/slashMenu.js`
  - Limit the main runtime preset menu to roughly three top-level rows.
  - Enable vertical scrolling when there are more than three top-level entries.
  - Keep group detection based on non-empty `subItems`, so empty groups do not expand.

## Testing

Add focused tests where practical:

- A top-level leaf can still be selected and generate its template.
- A group with empty `subItems` is not treated as expandable.
- A menu with more than three top-level entries gets a scroll limit.

Manual check:

- Open `/dev/preset-manager.html?nodeType=ai-image`.
- Create and save an empty system group.
- Create and save a top-level system leaf.
- Confirm the runtime preset menu shows both as top-level entries.
- Confirm more than three top-level entries scroll instead of expanding the picker height.

## Out Of Scope

- No migration of existing orphan/top-level leaves.
- No backend API changes.
- No changes to custom TXT preset behavior.
- No redesign of the preset manager layout.
