# 系统预设分组创建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在预设管理器里补齐“新建系统分组”，保留顶层系统叶子能力，并让运行时预设菜单最多显示三行后滚动。

**Architecture:** 继续使用现有系统预设 definitions 保存接口，不新增后端接口。管理器负责创建和保存顶层 group/leaf；运行时 `slashMenu` 负责正确展示空分组、非空分组、顶层叶子和滚动主列表。

**Tech Stack:** 原生 ES modules、DOM API、Node.js `node:test`、现有本地 API 封装。

---

## 文件结构

- Modify: `modules/promptPresets.js`
  - 运行时系统预设归一化。需要保留空 `subItems` 分组，否则空分组刷新后会被丢弃。

- Modify: `dev/preset-manager.js`
  - 管理器内部归一化、按钮绑定、系统分组 target、保存和校验逻辑。

- Modify: `dev/preset-manager.html`
  - 顶部工具栏增加“新建系统分组”按钮，放在“新建系统叶子”前面。

- Modify: `modules/slashMenu.js`
  - 空分组不展开、不生成；主列表包一层滚动容器，超过三行滚动。

- Test: `modules/promptPresets.test.js`
  - 覆盖空系统分组能被运行时保留下来。

- Test: `modules/slashMenu.test.js`
  - 覆盖空分组不可展开、顶层叶子仍可生成、主列表滚动限制。

---

### Task 1: 为运行时预设数据补空分组测试

**Files:**
- Test: `modules/promptPresets.test.js`

- [ ] **Step 1: 写失败测试**

在 `modules/promptPresets.test.js` 追加：

```js
test("promptPresets: preserves empty system groups", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      if (String(url) === "/api/v2/user/presets/definitions") {
        return makeJsonResponse({
          "ai-image": [
            {
              title: "Empty Group",
              desc: "Group without children",
              subItems: [],
            },
            {
              title: "Top Leaf",
              template: "top-leaf-template",
            },
          ],
        });
      }

      if (String(url) === "/api/v2/user/presets") {
        return makeJsonResponse({
          "ai-image": [],
          "ai-text": [],
          "ai-video": [],
          "ai-audio": [],
        });
      }

      throw new Error(`unexpected fetch url: ${String(url)}`);
    };

    const moduleUnderTest = await import(`./promptPresets.js?emptyGroup=${Date.now()}`);
    await moduleUnderTest.loadCustomPresets();

    const presets = moduleUnderTest.getPromptPresets("ai-image");
    assert.equal(presets.length, 2);
    assert.deepEqual(presets[0], {
      title: "Empty Group",
      desc: "Group without children",
      subItems: [],
    });
    assert.equal(presets[1].title, "Top Leaf");
    assert.equal(presets[1].template, "top-leaf-template");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
npm test -- modules/promptPresets.test.js
```

Expected: 新测试失败，`presets.length` 为 `1`，因为当前空分组会被归一化丢弃。

- [ ] **Step 3: 提交失败测试**

```powershell
git add modules/promptPresets.test.js
git commit -m "test: cover empty system preset groups"
```

---

### Task 2: 让运行时和管理器都保留空系统分组

**Files:**
- Modify: `modules/promptPresets.js`
- Modify: `dev/preset-manager.js`

- [ ] **Step 1: 修改运行时归一化**

在 `modules/promptPresets.js` 的 `normalizePresetItem` 中，把 `subItems` 分支改成只要存在数组就保留：

```js
  if (allowSubItems && Array.isArray(value.subItems)) {
    normalized.subItems = value.subItems
      .map((item) => normalizePresetItem(item, { allowSubItems: false }))
      .filter(Boolean);
    return normalized;
  }
```

保留下面 leaf 的 `template` 校验不变，让没有 `subItems` 且没有 `template` 的无效项继续被过滤。

- [ ] **Step 2: 修改管理器归一化**

在 `dev/preset-manager.js` 的 `normalizePresetItem` 中使用同样逻辑：

```js
  if (allowSubItems && Array.isArray(value.subItems)) {
    normalized.subItems = value.subItems
      .map((item) => normalizePresetItem(item, { allowSubItems: false }))
      .filter(Boolean);
    return normalized;
  }
```

这样新建空分组保存后，刷新管理器也不会消失。

- [ ] **Step 3: 运行测试并确认通过**

Run:

```powershell
npm test -- modules/promptPresets.test.js
```

Expected: `modules/promptPresets.test.js` 全部 PASS。

- [ ] **Step 4: 提交实现**

```powershell
git add modules/promptPresets.js dev/preset-manager.js
git commit -m "fix: preserve empty system preset groups"
```

---

### Task 3: 给预设管理器补“新建系统分组”

**Files:**
- Modify: `dev/preset-manager.html`
- Modify: `dev/preset-manager.js`

- [ ] **Step 1: 增加按钮 DOM**

在 `dev/preset-manager.html` 的 toolbar actions 中，放到 `new-system-button` 前面：

```html
<button id="new-system-group-button" class="ghost-button" type="button">新建系统分组</button>
```

按钮顺序应为：

```html
<button id="refresh-button" class="ghost-button" type="button">重新读取</button>
<button id="new-system-group-button" class="ghost-button" type="button">新建系统分组</button>
<button id="new-system-button" class="ghost-button" type="button">新建系统叶子</button>
<button id="new-custom-button" class="primary-button" type="button">新建 TXT 预设</button>
```

- [ ] **Step 2: 绑定按钮元素**

在 `dev/preset-manager.js` 的 `elements` 中加入：

```js
  newSystemGroupButton: document.getElementById("new-system-group-button"),
```

放在 `refreshButton` 和 `newSystemButton` 之间。

- [ ] **Step 3: 新增 group target helper**

在 `createSystemLeafTarget()` 前后增加：

```js
function createSystemGroupTarget() {
  return {
    source: "system",
    mode: "create",
    kind: "group",
    nodeType: state.nodeType,
    itemIndex: null,
    childIndex: null,
    parentItemIndex: null,
  };
}
```

- [ ] **Step 4: 让新建 group 的编辑区文案正确**

在 `getEditorPresentation(target)` 的 system create 分支前加入：

```js
  if (target.mode === "create" && target.kind === "group") {
    return {
      title: "新建系统分组",
      meta: "系统分组会写入预设树顶层，可以先保存为空分组；后续选中分组后再新增子预设。",
      sourceLabel: "系统分组",
      sourceClass: "",
    };
  }
```

- [ ] **Step 5: 允许空分组通过校验**

在 `validateSystemDraft(target, draft)` 中删除这个分支：

```js
  if (target.kind === "group") {
    const item = getSystemTargetItem(target);
    if (!Array.isArray(item?.subItems) || !item.subItems.length) {
      return "系统分组至少需要保留一个子预设";
    }
  }
```

删除后仍保留标题非空、叶子模板非空、同级标题不重复三类校验。

- [ ] **Step 6: 创建分组时写入空 subItems**

在 `buildSystemItemFromDraft(target, draft)` 中，保留当前编辑已有分组时复制原 `subItems`，并让新建分组写空数组：

```js
  if (target.kind === "group") {
    const existing = getSystemTargetItem(target);
    item.subItems = cloneJsonValue(existing?.subItems || []);
    return item;
  }
```

这个代码已经接近目标；确认 `target.mode === "create"` 时 `existing` 是 `null`，所以会生成 `subItems: []`。

- [ ] **Step 7: 增加启动新建分组的函数和事件绑定**

在 `startNewSystemPreset()` 前加入：

```js
function startNewSystemGroup() {
  setEditorTarget(createSystemGroupTarget());
  elements.presetTitleInput.focus();
}
```

在 `init()` 的事件绑定中加入：

```js
elements.newSystemGroupButton.addEventListener("click", startNewSystemGroup);
```

放在 `refreshButton` 和 `newSystemButton` 绑定之间。

- [ ] **Step 8: 手动验证管理器**

Run:

```powershell
npm test -- modules/promptPresets.test.js
```

Expected: PASS。

Manual:

```text
打开 http://127.0.0.1:8777/dev/preset-manager.html?nodeType=ai-image
点击“新建系统分组”
输入标题“测试空分组”
保存
点击“重新读取”
确认“测试空分组”仍在系统预设树中，徽标显示为“分组”
点击“新建系统叶子”
输入标题和模板
保存后确认它仍作为顶层叶子存在
```

- [ ] **Step 9: 提交管理器改动**

```powershell
git add dev/preset-manager.html dev/preset-manager.js
git commit -m "feat: add system preset group creation"
```

---

### Task 4: 运行时菜单支持空分组不展开和三行滚动

**Files:**
- Test: `modules/slashMenu.test.js`
- Modify: `modules/slashMenu.js`

- [ ] **Step 1: 写空分组不可展开测试**

在 `modules/slashMenu.test.js` 追加：

```js
test("slashMenu: empty system group is shown as a top-level item without submenu", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    definitions: makeDefinitions("ai-image", [
      {
        title: "Empty Group",
        desc: "No children yet",
        subItems: [],
      },
    ]),
  });

  try {
    const emptyGroup = testContext.document.querySelector('[data-action="empty-group"]');
    assert.ok(emptyGroup);
    assert.equal(testContext.document.querySelectorAll(".preset-slash-submenu").length, 0);

    dispatchMouseDown(emptyGroup);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(testContext.generated.length, 0);
    assert.equal(testContext.slashMenu.getSlashMenu().classList.contains("open"), true);
  } finally {
    testContext.cleanup();
  }
});
```

- [ ] **Step 2: 写主列表滚动测试**

在 `modules/slashMenu.test.js` 追加：

```js
test("slashMenu: top-level menu scrolls after three visible rows", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    definitions: makeDefinitions("ai-image", [
      { title: "Leaf 1", template: "one" },
      { title: "Leaf 2", template: "two" },
      { title: "Leaf 3", template: "three" },
      { title: "Leaf 4", template: "four" },
    ]),
  });

  try {
    const scrollRegion = testContext.document.querySelector('[data-slash-role="top-scroll"]');
    assert.ok(scrollRegion);
    assert.equal(scrollRegion.style.overflowY, "auto");
    assert.equal(scrollRegion.style.maxHeight, "198px");
    assert.equal(testContext.document.querySelectorAll("[data-slash-role='top-item']").length, 4);
  } finally {
    testContext.cleanup();
  }
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run:

```powershell
npm test -- modules/slashMenu.test.js
```

Expected: 新增两个测试失败，原因是当前没有 `empty-group` action，也没有 `top-scroll` 容器。

- [ ] **Step 4: 增加菜单常量**

在 `modules/slashMenu.js` 常量区加入：

```js
const TOP_LEVEL_VISIBLE_ROW_COUNT = 3;
const TOP_LEVEL_ROW_HEIGHT = 66;
```

- [ ] **Step 5: 区分非空分组和空分组**

在 `isPresetGroup` 下方加入：

```js
function isPresetEmptyGroup(preset) {
  return Array.isArray(preset?.subItems) && preset.subItems.length === 0;
}
```

- [ ] **Step 6: 创建主列表滚动容器**

在 `createCustomPresetItem()` 后加入：

```js
function createTopLevelScrollRegion(items) {
  const region = document.createElement("div");
  region.className = "preset-slash-top-scroll";
  region.dataset.slashRole = "top-scroll";
  Object.assign(region.style, {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    maxHeight: `${TOP_LEVEL_VISIBLE_ROW_COUNT * TOP_LEVEL_ROW_HEIGHT}px`,
    overflowY: "auto",
    overflowX: "visible",
    paddingRight: "2px",
  });
  region.replaceChildren(...items);
  return region;
}
```

- [ ] **Step 7: 修改顶层 item action**

在 `createTopLevelItem(preset, index)` 中，把 action 设置改成：

```js
  item.dataset.action = isPresetGroup(preset)
    ? "open-group"
    : isPresetEmptyGroup(preset)
      ? "empty-group"
      : "select-leaf";
```

描述文案改成：

```js
  desc.textContent = isPresetEmptyGroup(preset)
    ? "暂无子预设"
    : preset.desc || preset.template || "包含多个子预设";
```

保留箭头只在 `isPresetGroup(preset)` 时出现。

- [ ] **Step 8: 阻止空分组点击生成**

在 `handleMenuPointerDown(event)` 中加入：

```js
  if (action === "empty-group") {
    return;
  }
```

放在 `open-group` 分支后或前都可以，但必须在 `open-custom-manager` 前。

- [ ] **Step 9: 让 Enter 键对空分组无操作**

在 `handleSlashKeyboardNavigation(event)` 的 `Enter` 分支中，`select-leaf` 分支后加入：

```js
    if (activeItem?.dataset.action === "empty-group") {
      return true;
    }
```

- [ ] **Step 10: 用滚动容器包住主列表**

在 `renderMenu(presets, context)` 中，把直接 append 顶层项的逻辑改成：

```js
  const topLevelItems = presets.map((preset, index) => createTopLevelItem(preset, index));

  if (CUSTOM_SUPPORTED_NODE_TYPES.has(context.nodeType)) {
    topLevelItems.push(createCustomPresetItem());
  }

  if (topLevelItems.length > 0) {
    menu.appendChild(createTopLevelScrollRegion(topLevelItems));
  }
```

删除原来的这两段直接 append：

```js
  presets.forEach((preset, index) => {
    menu.appendChild(createTopLevelItem(preset, index));
  });

  if (CUSTOM_SUPPORTED_NODE_TYPES.has(context.nodeType)) {
    menu.appendChild(createCustomPresetItem());
  }
```

保留后面的 submenu append，让二级菜单继续作为 `menu` 的绝对定位子元素，不被滚动容器裁剪。

- [ ] **Step 11: 运行 slash menu 测试**

Run:

```powershell
npm test -- modules/slashMenu.test.js
```

Expected: `modules/slashMenu.test.js` 全部 PASS。

- [ ] **Step 12: 提交运行时菜单改动**

```powershell
git add modules/slashMenu.js modules/slashMenu.test.js
git commit -m "fix: limit preset menu height"
```

---

### Task 5: 全量相关验证

**Files:**
- Verify only

- [ ] **Step 1: 运行相关测试**

Run:

```powershell
npm test -- modules/promptPresets.test.js modules/slashMenu.test.js
```

Expected: 两个测试文件全部 PASS。

- [ ] **Step 2: 运行全量前端测试**

Run:

```powershell
npm test
```

Expected: 全量 Node 测试 PASS。若失败，先确认是否是已有无关失败；本需求相关失败必须修复。

- [ ] **Step 3: 手动走一遍业务路径**

Manual:

```text
1. 打开预设管理器。
2. 点击“新建系统分组”，保存一个空分组。
3. 重新读取，确认空分组没有消失。
4. 点击“新建系统叶子”，保存一个顶层叶子。
5. 在使用界面呼出预设菜单，确认空分组作为一级项出现但不展开。
6. 确认顶层叶子可以直接点击生成。
7. 保证一级项超过三个时主列表出现滚动条。
```

- [ ] **Step 4: 最终提交检查**

Run:

```powershell
git status --short
```

Expected: 只剩用户已有的无关改动；本需求相关文件都已提交。
