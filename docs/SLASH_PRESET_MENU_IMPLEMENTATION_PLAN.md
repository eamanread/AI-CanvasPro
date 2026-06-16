# Slash Preset Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable slash-triggered preset selection for AI image and AI text nodes, including second-level system presets and the custom preset manager entry.

**Architecture:** Keep preset persistence and manager APIs unchanged. Limit runtime behavior changes to the shared slash menu module, using explicit menu state instead of hover-derived submenu state. Preserve the existing contract where selecting a preset sends its `template` into the node generation flow through `onGenerate(template)`.

**Tech Stack:** Native browser DOM, ES modules, Node built-in test runner, Python `unittest`, local `http.server` API routes.

---

## Impact Audit

### Affected Runtime Areas

- `modules/slashMenu.js`
  - Owns `/` trigger detection, menu rendering, keyboard navigation, prompt slash removal, prompt store sync, and `onGenerate(template)` dispatch.
  - This is the only runtime file that should require behavioral edits for this bug.
- `components/AIGenerateNode.js`
  - Image node imports and passes `checkSlashTrigger`, `handleSlashKeyboardNavigation`, and `closeSlashMenu`.
  - No change planned. The node should continue passing `nodeType: "ai-image"` and its existing `_onGenerate` callback.
- `components/AIGenTextNode.js`
  - Text node imports and passes the same slash menu APIs.
  - No change planned. The node should continue passing `nodeType: "ai-text"` and its existing `_onGenerate` callback.

### Affected Data Sources

- `config/prompt-presets.json`
  - System presets already support:
    - top-level leaf: `{ title, icon?, desc?, template }`
    - top-level group: `{ title, icon?, desc?, subItems: [...] }`
    - second-level leaf: `{ title, icon?, desc?, template }`
  - No schema migration planned.
- `user/prompt/<nodeType>/*.txt`
  - Custom TXT presets remain leaf-only.
  - No `icon`, `desc`, or `subItems` support will be added in this fix.
- `modules/promptPresets.js`
  - Already merges system definitions and custom TXT presets.
  - Already exports `openCustomPresetsManager(nodeType)`.
  - Only small test coverage may be added; avoid changing normalization unless a test proves it is necessary.

### Affected Manager And Backend Areas

- `dev/preset-manager.js`
  - Already supports system groups, system child presets, custom TXT presets, save/delete, and BroadcastChannel/localStorage refresh.
  - No change planned.
- `api/promptPresetsApi.js` and `api/promptPresetsManagerApi.js`
  - Existing endpoints are sufficient.
  - No change planned.
- `services/library_file_route_service.py`
  - Already validates two-level `subItems` for system presets and leaf-only TXT custom presets.
  - No change planned.

### Fields That Must Not Change

- `nodeType`
- `title`
- `icon`
- `desc`
- `template`
- `subItems`
- node data field `prompt`
- generation payload fields built by image/text task modules
- provider/model fields such as `model`, `provider`, `aspectRatio`, `imageSize`, `batchSize`

### Non-Goals

- Do not add third-level preset nesting.
- Do not convert custom TXT presets into JSON.
- Do not edit `config/prompt-presets.json` content.
- Do not change text/image generation payload construction.
- Do not refactor node model menus or provider selection.
- Do not change backend preset routes.

## Behavior Contract

- Leaf preset:
  - Remove only the slash trigger `/`.
  - Sync `promptEl.innerHTML` back to store field `prompt`.
  - Close the slash menu.
  - Call `context.onGenerate(template)`.
- Group preset:
  - Open or keep open its second-level submenu.
  - Do not call `onGenerate`.
  - Do not remove `/`.
- Second-level leaf preset:
  - Same behavior as leaf preset.
- Custom preset entry:
  - Remove only the slash trigger `/`.
  - Sync `promptEl.innerHTML` back to store field `prompt`.
  - Close the slash menu.
  - Call `openCustomPresetsManager(context.nodeType)`.
  - Do not call `onGenerate`.

## File Map

- Modify: `modules/slashMenu.js`
  - Import `openCustomPresetsManager`.
  - Replace hover-derived submenu state with explicit state.
  - Add common leaf selection helper.
  - Add custom manager selection helper.
  - Add stable menu event delegation.
  - Keep public exports unchanged: `getSlashMenu`, `closeSlashMenu`, `checkSlashTrigger`, `handleSlashKeyboardNavigation`.
- Modify: `modules/promptPresets.test.js`
  - Add coverage that `openCustomPresetsManager("ai-text")` opens the manager with the correct query.
- Create: `modules/slashMenu.test.js`
  - Add focused DOM interaction tests for leaf selection, group expansion, child selection, custom manager entry, and keyboard navigation.
- Modify: `docs/TASKS.md`
  - Add executable P0 task for slash submenu and custom manager completion.
- Modify: `docs/DECISIONS.md`
  - Record the explicit-state slash menu decision.

## Implementation Tasks

### Task 1: Add The Executable Task Record

**Files:**
- Modify: `docs/TASKS.md`

- [ ] Add task `T006 Slash Preset Submenu And Custom Manager Completion`.

Use this exact task block:

```markdown
### T006 Slash Preset Submenu And Custom Manager Completion
- status: ready
- priority: P0
- depends_on: []
- acceptance:
  - AI image node slash menu can select a second-level system preset with the mouse.
  - AI text node slash menu can select a second-level system preset with the mouse.
  - Keyboard navigation can open a preset group and select a second-level preset.
  - Selecting a preset group only opens its submenu and never triggers generation.
  - Clicking the custom preset entry opens `/dev/preset-manager.html?nodeType=<current-node-type>`.
  - Selecting a leaf preset removes the `/` trigger, syncs node `prompt`, closes the menu, and calls `onGenerate(template)`.
  - Custom TXT presets remain leaf-only and no preset data schema changes are introduced.
```

### Task 2: Record The Technical Decision

**Files:**
- Modify: `docs/DECISIONS.md`

- [ ] Append a decision under `### 2026-04-30`.

Use this exact bullet:

```markdown
- Complete slash preset submenu and custom-manager behavior inside `modules/slashMenu.js` by using explicit menu state and delegated menu actions instead of hover-derived submenu state. This keeps preset data, manager APIs, backend routes, and generation payload fields unchanged.
```

### Task 3: Add Prompt Manager URL Coverage

**Files:**
- Modify: `modules/promptPresets.test.js`

- [ ] Add a test for `openCustomPresetsManager`.

Append this test to the file:

```js
test("promptPresets: openCustomPresetsManager opens the requested node type manager", async () => {
  const originalWindow = globalThis.window;
  const calls = [];

  try {
    globalThis.window = {
      screen: {
        width: 1920,
        height: 1080,
      },
      open(url, name, features) {
        calls.push({ url, name, features });
        return {
          focus() {
            calls.push({ focus: true });
          },
        };
      },
      addEventListener() {},
    };

    const moduleUnderTest = await import(`./promptPresets.js?manager=${Date.now()}`);
    const managerWindow = moduleUnderTest.openCustomPresetsManager("ai-text");

    assert.ok(managerWindow);
    assert.equal(calls[0].url, "/dev/preset-manager.html?nodeType=ai-text");
    assert.equal(calls[0].name, "huanying-preset-manager");
    assert.match(calls[0].features, /width=1480/);
    assert.deepEqual(calls[1], { focus: true });
  } finally {
    globalThis.window = originalWindow;
  }
});
```

- [ ] Run the test.

```powershell
node --test modules/promptPresets.test.js
```

Expected: all tests in `modules/promptPresets.test.js` pass.

### Task 4: Create Slash Menu Interaction Tests

**Files:**
- Create: `modules/slashMenu.test.js`

- [ ] Create a lightweight browser-like DOM fixture for slash menu tests.

The fixture must support:

- `document.createElement`
- `document.body`
- `document.getElementById`
- `element.appendChild`
- `element.replaceChildren`
- `element.querySelector`
- `element.querySelectorAll`
- `element.closest`
- `element.classList`
- `element.dataset`
- `element.style`
- `element.addEventListener`
- `element.dispatchEvent`
- `window.getSelection`
- `document.createRange`
- `document.createTreeWalker`

- [ ] Add these exact test cases and assertions:

- `slashMenu: mouse selection of a second-level preset calls onGenerate with child template`
  - Fixture preset data: one `ai-image` group with one child whose `template` is `child-template`.
  - Trigger: prompt content is `/`, call `checkSlashTrigger(...)`, then dispatch `mousedown` on `[data-action="select-child"]`.
  - Required assertions: prompt text is empty, the menu no longer has class `open`, store sync receives `{ prompt: "" }`, and `generated` equals `["child-template"]`.
- `slashMenu: clicking a group opens submenu and does not generate`
  - Fixture preset data: one `ai-text` group with one child.
  - Trigger: prompt content is `/`, call `checkSlashTrigger(...)`, then dispatch `mousedown` on `[data-action="open-group"]`.
  - Required assertions: `generated.length` is `0`, the group remains active, and one child item is visible.
- `slashMenu: custom entry opens manager for the active node type`
  - Fixture preset data: one `ai-text` leaf plus the built-in custom entry.
  - Trigger: prompt content is `/`, call `checkSlashTrigger(...)`, then dispatch `mousedown` on `[data-action="open-custom-manager"]`.
  - Required assertions: `generated.length` is `0`, prompt text is empty, and the manager opener receives `ai-text`.
- `slashMenu: keyboard opens a group and selects a second-level preset`
  - Fixture preset data: first item is a group with first child template `first-child-template`.
  - Trigger: prompt content is `/`, call `checkSlashTrigger(...)`, then call `handleSlashKeyboardNavigation({ key: "ArrowRight", preventDefault })` and `handleSlashKeyboardNavigation({ key: "Enter", preventDefault })`.
  - Required assertions: `generated` equals `["first-child-template"]` and both keyboard calls return `true`.

- [ ] Keep the tests focused on public slash menu exports:

```js
import {
  checkSlashTrigger,
  closeSlashMenu,
  getSlashMenu,
  handleSlashKeyboardNavigation,
} from "./slashMenu.js";
```

- [ ] Run the new test.

```powershell
node --test modules/slashMenu.test.js
```

Expected: all slash menu tests pass.

### Task 5: Refactor Slash Menu State

**Files:**
- Modify: `modules/slashMenu.js`

- [ ] Replace the current `activeSubmenuState` shape with explicit state.

Use this shape:

```js
let menuState = {
  context: null,
  presets: [],
  topIndex: 0,
  openGroupIndex: -1,
  childIndex: -1,
  mode: "top",
};
```

- [ ] Add helpers with these responsibilities:

```js
function isPresetGroup(preset) {
  return Array.isArray(preset?.subItems) && preset.subItems.length > 0;
}

function getMenuItems() {
  const menu = ensureSlashMenu();
  return Array.from(menu.querySelectorAll("[data-slash-role='top-item']"));
}

function getSubmenuItems() {
  const menu = ensureSlashMenu();
  return Array.from(menu.querySelectorAll("[data-slash-role='child-item']"));
}

function setTopIndex(nextIndex) {
  const items = getMenuItems();
  if (!items.length) {
    menuState.topIndex = 0;
    return;
  }
  const bounded = ((nextIndex % items.length) + items.length) % items.length;
  menuState.topIndex = bounded;
  activateItem(items, bounded);
}
```

- [ ] Make `closeSlashMenu()` reset `menuState` to the default object.

### Task 6: Add Common Action Helpers

**Files:**
- Modify: `modules/slashMenu.js`

- [ ] Import the custom manager entry.

```js
import {
  getPromptPresets,
  openCustomPresetsManager,
} from "./promptPresets.js";
```

- [ ] Add one common leaf selection helper.

```js
function selectPresetTemplate(template, context) {
  const safeTemplate = String(template || "");
  if (!safeTemplate.trim() || !context) {
    return;
  }
  removeSlashTriggerFromPrompt(context);
  syncPromptValue(context.nodeId, context.promptEl);
  closeSlashMenu();
  setTimeout(() => {
    context.onGenerate(safeTemplate);
  }, 50);
}
```

- [ ] Add one custom manager helper.

```js
function openCustomPresetManagerForContext(context) {
  if (!context) {
    return;
  }
  removeSlashTriggerFromPrompt(context);
  syncPromptValue(context.nodeId, context.promptEl);
  const nodeType = context.nodeType || "ai-image";
  closeSlashMenu();
  openCustomPresetsManager(nodeType);
}
```

### Task 7: Render Stable Data Attributes

**Files:**
- Modify: `modules/slashMenu.js`

- [ ] Add stable data attributes to top-level items.

Each top-level item must include:

```js
item.dataset.slashRole = "top-item";
item.dataset.action = hasSubItems ? "open-group" : "select-leaf";
item.dataset.index = String(index);
```

- [ ] Add stable data attributes to second-level child items.

Each child item must include:

```js
item.dataset.slashRole = "child-item";
item.dataset.action = "select-child";
item.dataset.parentIndex = String(parentIndex);
item.dataset.childIndex = String(childIndex);
```

- [ ] Add stable data attributes to the custom item.

```js
item.dataset.slashRole = "custom-item";
item.dataset.action = "open-custom-manager";
```

### Task 8: Replace Hover-Only Submenu Control

**Files:**
- Modify: `modules/slashMenu.js`

- [ ] Render submenu as a sibling panel inside the menu or as a positioned portal appended to the menu root.

Required behavior:

- A group item click opens the submenu.
- Hovering a group may also open the submenu, but hover is only a convenience and not the source of truth.
- Submenu visibility is derived from `menuState.openGroupIndex`.
- The submenu must not close while moving the pointer from the group to its children.

- [ ] Add viewport clamping for submenu position.

Use this behavior:

```js
function clampSubmenuPosition(submenu, parentItem) {
  const parentRect = parentItem.getBoundingClientRect();
  const menuRect = ensureSlashMenu().getBoundingClientRect();
  submenu.style.top = `${Math.max(0, parentRect.top - menuRect.top)}px`;
  submenu.style.left = "calc(100% + 6px)";

  requestAnimationFrame(() => {
    const rect = submenu.getBoundingClientRect();
    const overflowRight = rect.right - window.innerWidth + 8;
    if (overflowRight > 0) {
      submenu.style.left = `-${rect.width + 6}px`;
    }
    const overflowBottom = rect.bottom - window.innerHeight + 8;
    if (overflowBottom > 0) {
      const currentTop = parseFloat(submenu.style.top || "0") || 0;
      submenu.style.top = `${Math.max(0, currentTop - overflowBottom)}px`;
    }
  });
}
```

### Task 9: Use Delegated Menu Actions

**Files:**
- Modify: `modules/slashMenu.js`

- [ ] Install one delegated pointer handler on the menu root.

Use this action table:

```js
function handleMenuPointerDown(event) {
  const actionEl = event.target?.closest?.("[data-action]");
  if (!actionEl || !ensureSlashMenu().contains(actionEl)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const action = actionEl.dataset.action;
  if (action === "select-leaf") {
    const preset = menuState.presets[Number(actionEl.dataset.index)];
    selectPresetTemplate(preset?.template, menuState.context);
    return;
  }

  if (action === "open-group") {
    openGroupByIndex(Number(actionEl.dataset.index));
    return;
  }

  if (action === "select-child") {
    const parent = menuState.presets[Number(actionEl.dataset.parentIndex)];
    const child = parent?.subItems?.[Number(actionEl.dataset.childIndex)];
    selectPresetTemplate(child?.template, menuState.context);
    return;
  }

  if (action === "open-custom-manager") {
    openCustomPresetManagerForContext(menuState.context);
  }
}
```

- [ ] Ensure `renderMenu()` attaches this handler once per render and removes old menu children cleanly through `replaceChildren()`.

### Task 10: Keyboard Navigation

**Files:**
- Modify: `modules/slashMenu.js`

- [ ] Update `handleSlashKeyboardNavigation(event)` to use `menuState`.

Required behavior:

- `ArrowDown` and `ArrowUp` move through top items in top mode.
- `ArrowRight` on a group opens the group and enters child mode.
- `Enter` on a group opens the group and enters child mode.
- `Enter` on a top leaf selects the top leaf.
- `ArrowDown` and `ArrowUp` move through child items in child mode.
- `ArrowLeft` exits child mode and keeps the group selected.
- `Enter` in child mode selects the active child.
- `Escape` always closes the menu.

### Task 11: Validation

**Files:**
- Validate changed files only.

- [ ] Run JavaScript unit tests.

```powershell
node --test modules/promptPresets.test.js modules/slashMenu.test.js
```

Expected: all tests pass.

- [ ] Run backend preset route regression tests.

```powershell
python -m unittest library_file_route_service_test.py http_route_dispatcher_test.py
```

Expected: all tests pass.

- [ ] Do not use `npm run precommit:check` for this task in the current source snapshot.

Reason: `package.json` references `tools/check_architecture_guard.cjs`, `tools/check_encoding_guard.cjs`, and `e2e/smoke.spec.js`, but this snapshot only contains `tools/build_windows_bundle.py` and no `e2e/` directory. Use the targeted Node and Python commands above, then run the manual browser smoke below.

- [ ] Run manual browser smoke on `http://127.0.0.1:8777/`.

Manual checks:

- AI image node: type `/`, open a system group, click a second-level child, verify generation starts with that child template.
- AI text node: type `/`, open a system group, click a second-level child, verify generation starts with that child template.
- AI image node: type `/`, click custom preset entry, verify manager opens with `nodeType=ai-image`.
- AI text node: type `/`, click custom preset entry, verify manager opens with `nodeType=ai-text`.
- Keyboard: type `/`, press `ArrowRight`, press `Enter`, verify first child template is selected.
- Regression: selecting a top-level leaf still works.
- Regression: clicking outside still closes the menu.

## Rollback Plan

- Revert only `modules/slashMenu.js`, `modules/slashMenu.test.js`, and the added test block in `modules/promptPresets.test.js`.
- Do not revert preset data files or manager files, because this plan does not require changing them.
- Backend files should remain untouched.

## Completion Criteria

- `docs/TASKS.md` has `T006` marked `done`.
- `docs/DECISIONS.md` records the explicit-state menu decision.
- Unit and backend regression tests pass.
- Manual smoke verifies both `ai-image` and `ai-text` nodes for mouse and keyboard submenu selection.
- Custom manager opens with the current node type.
