# RH Assistant Chat Dialog UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 RH/Claw 智能体会话框补齐截图中框选的四个核心能力：历史会话、新建对话、上传图片、`@` 引用。

**Architecture:** 复用现有 `modules/app/appAssistantPanel.js` 面板控制器和 `/api/v2/assistant/conversations/*` 持久化接口，只调整 UI 结构、会话入口和输入区状态。图片与引用作为发送时的 `context.userReferences` 合并进现有聊天上下文，不新增聊天接口路由。

**Tech Stack:** 原生 ES Module、DOM API、Node `node:test`、现有 Python assistant route 与 `ClawConversationMemoryService`。

---

## 1. UI 分析与本期范围

截图里的会话框是深色右侧/移动端全高聊天面板。中间的技能入口列表本期不处理，保留现有消息区或空态即可。

本期只实现框选功能：

| 区域 | 截图含义 | 本期行为 |
|---|---|---|
| 顶部时钟按钮 | 历史会话 | 点击打开会话历史列表，可搜索、切换已有会话 |
| 顶部带加号气泡按钮 | 新建对话 | 点击创建空会话，清空可见消息，输入框聚焦 |
| 输入框左侧 `+` 上传块 | 上传图片 | 点击选择图片，上传/登记为本地资源，显示缩略图，可移除 |
| 输入区底部 `@` | 艾特引用 | 点击打开引用选择器，选择画布节点、素材或已上传图片，生成引用 chip |

本期明确不做：

| 区域 | 处理 |
|---|---|
| 中间技能列表 | 不实现技能分类、技能切换、技能图标 |
| Ask、Agent、爆款实验室等模式按钮 | 保持现有能力，不纳入本次交付 |
| 真正多模态图片内容发送 | 不直接把 base64 原图塞进 chat payload；先传图片元数据、本地 URL、缩略图和引用说明 |

## 2. 现有代码映射

可直接复用的能力：

| 能力 | 现有文件 | 说明 |
|---|---|---|
| 聊天面板 DOM、样式、事件 | `modules/app/appAssistantPanel.js` | 已有 `createAssistantPanelController()`、`createPanel()`、`bindEvents()`、`submitMessage()` |
| 会话列表/新建/切换 | `modules/app/appAssistantPanel.js` | 已有 `refreshConversations()`、`createNewConversation()`、`switchConversation()`、`renderConversationList()` |
| 会话 API 注入 | `modules/app/appAssistantPanel.autoload.js` | 已有 `listPersistentConversations()`、`createPersistentConversation()`、`fetchPersistentConversation()` |
| 前端 assistant API | `api/clawAssistantApi.js` | 已有 `fetchClawAssistantConversations()`、`createClawAssistantConversation()` 等 |
| 后端会话路由 | `services/claw_assistant_route_service.py` | 已有 `/api/v2/assistant/conversations/list|get|search|rename|delete|export` |
| 后端会话存储 | `services/claw_conversation_memory_service.py` | 已有 conversation meta、messages、operations、summary |
| 画布/素材上下文 | `modules/assistant/assistantContextBuilder.js` | 已有 canvas、selection、assets、conversationMemory 摘要 |
| 文件上传基础 | `services/projectService.js` | 已导出 `uploadFile(file)` 并归一化图片存储字段 |

主要差距：

| 差距 | 影响 |
|---|---|
| 顶部历史/新建入口现在藏在 topic bar，而不是截图右上角图标 | 需要重排 header controls |
| 输入区只有 textarea + 发送按钮 | 需要新增上传、`@`、缩略图/引用 chip 容器 |
| `submitMessage()` 只合并 `buildContext()` 和会话记忆 | 需要把临时图片与引用合并进 context |
| 测试 fake DOM 对 file input/change 支持有限 | 需要补最小 DOM 能力或把上传逻辑拆成可单测 helper |

## 3. 数据契约

发送时在原有 chat payload 的 `context` 内新增 `userReferences`，不改 `sendClawAssistantMessage()` 的 API 签名。

```js
{
  conversationId: "conv_...",
  message: "帮我基于 @参考图 做一套海报",
  context: {
    project: {},
    canvas: {},
    assets: {},
    conversationMemory: {},
    userReferences: {
      uploads: [
        {
          id: "upload_...",
          name: "reference.png",
          mimeType: "image/png",
          size: 123456,
          localUrl: "/output/...",
          thumbUrl: "/output/...",
          displayUrl: "/output/..."
        }
      ],
      mentions: [
        {
          type: "node",
          id: "node_abc",
          label: "主视觉图",
          nodeType: "source-image"
        },
        {
          type: "asset",
          id: "asset_abc",
          label: "品牌参考"
        },
        {
          type: "upload",
          id: "upload_...",
          label: "reference.png"
        }
      ]
    }
  }
}
```

规则：

- `uploads` 只保留可读元数据与本地访问 URL，不放原始 data URL。
- `mentions` 是用户显式点选的引用，优先级高于自动上下文里的当前选区。
- 发送成功后清空本轮 `pendingUploads` 和 `pendingReferences`；发送失败时保留，方便用户重试。

## 4. File Structure

| 文件 | 操作 | 责任 |
|---|---|---|
| `modules/app/appAssistantPanel.js` | Modify | 重构顶部按钮、历史弹层、composer、上传/引用状态、发送上下文合并 |
| `modules/app/appAssistantPanel.autoload.js` | Modify | 注入上传适配器、引用候选列表构造器 |
| `modules/app/appAssistantPanel.test.js` | Modify | 覆盖历史按钮、新建按钮、上传图片、`@` 引用、发送上下文 |
| `modules/app/appAssistantPanel.autoload.test.js` | Modify | 覆盖 autoload 注入 uploadFile 和 reference candidate 读取 |
| `api/clawAssistantApi.test.js` | No change expected | 会话 API 已覆盖；若 payload 结构不改无需动 |
| `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md` | Optional Modify | 真正实现后追加交接日志；本计划阶段不改 |

## 5. Task 1: 调整面板骨架为截图式会话框

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: 为 header 增加可复用图标按钮 helper**

在 `createElement()` 后新增：

```js
function createIconButton(documentRef, { className, action, label, textContent }) {
  return createElement(documentRef, "button", {
    type: "button",
    className,
    textContent,
    dataset: { clawAssistantAction: action },
    attributes: { "aria-label": label, title: label },
  });
}
```

- [ ] **Step 2: 重排 `createPanel()` header**

把现有关闭按钮旁新增两个按钮。关闭按钮保留在最右，历史与新建放在其左侧。

```js
const headerActions = createElement(documentRef, "div", {
  className: "claw-assistant-header-actions",
});
headerActions.appendChild(
  createIconButton(documentRef, {
    className: "claw-assistant-header-icon",
    action: "toggle-history",
    label: "历史会话",
    textContent: "◷",
  })
);
headerActions.appendChild(
  createIconButton(documentRef, {
    className: "claw-assistant-header-icon",
    action: "new-topic",
    label: "新建对话",
    textContent: "+",
  })
);
headerActions.appendChild(
  createIconButton(documentRef, {
    className: "claw-assistant-close",
    action: "close",
    label: "关闭 RH 智能体",
    textContent: "›",
  })
);
header.appendChild(titleWrap);
header.appendChild(headerActions);
```

- [ ] **Step 3: 把 topic bar 从常驻条改为历史弹层**

保留 `topicsEl` 与 `topicToolsEl`，删除或隐藏旧的 `topicBar.appendChild(topicCurrentEl)` 常驻条。新增一个 `historyPopoverEl` 包住 search、tool buttons、topics list。

```js
historyPopoverEl = createElement(documentRef, "div", {
  className: "claw-assistant-history-popover",
  hidden: true,
});
historyPopoverEl.appendChild(topicToolsEl);
historyPopoverEl.appendChild(topicsEl);
panel.appendChild(header);
panel.appendChild(historyPopoverEl);
panel.appendChild(messagesEl);
```

- [ ] **Step 4: 更新事件绑定**

把旧的 `toggle-topics` 监听替换为 `toggle-history`：

```js
panelEl
  .querySelector('[data-claw-assistant-action="toggle-history"]')
  ?.addEventListener("click", () => {
    const nextHidden = !(historyPopoverEl?.hidden);
    if (historyPopoverEl) historyPopoverEl.hidden = nextHidden;
    if (!nextHidden) void refreshConversations({ loadHistory: false });
  });
```

- [ ] **Step 5: 增加样式**

在 `injectStyles()` 内替换面板尺寸，使其更接近截图：

```css
.claw-assistant-panel{
  position:fixed;
  right:0;
  top:0;
  bottom:0;
  width:min(540px,100vw);
  height:100vh;
  border-radius:0;
}
.claw-assistant-header-actions{
  display:flex;
  align-items:center;
  gap:8px;
}
.claw-assistant-header-icon{
  appearance:none;
  width:34px;
  height:34px;
  border:1px solid rgba(255,255,255,.12);
  border-radius:8px;
  background:rgba(255,255,255,.04);
  color:var(--text-primary,#fff);
  cursor:pointer;
}
.claw-assistant-history-popover{
  border-bottom:1px solid var(--stroke-08,rgba(255,255,255,.08));
  background:rgba(12,12,18,.98);
}
```

- [ ] **Step 6: 运行面板测试**

Run:

```bash
node --test modules/app/appAssistantPanel.test.js
```

Expected: 现有打开/关闭、发送消息、历史话题测试通过；若旧测试依赖 `toggle-topics`，更新为 `toggle-history`。

## 6. Task 2: 顶部“历史会话”交互

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: 将历史列表中文案改成产品文案**

`renderConversationList()` 空态从 `"No topics"` 改为：

```js
textContent: "暂无历史会话",
```

`topicSearchInputEl` placeholder 改为：

```js
placeholder: "搜索历史会话",
"aria-label": "搜索 RH 智能体历史会话",
```

- [ ] **Step 2: 切换历史后关闭弹层**

在 `switchConversation()` 成功加载后追加：

```js
if (historyPopoverEl) historyPopoverEl.hidden = true;
```

- [ ] **Step 3: 新增测试：点击历史按钮显示会话列表**

在 `appAssistantPanel.test.js` 新增断言：

```js
test("assistant panel opens conversation history from the header history button", async () => {
  const { document, fab } = setupDocument();
  const controller = createAssistantPanelController({
    document,
    assistantApi: {
      fetchStatus: async () => ({ success: true, available: true, status: "ready" }),
      sendMessage: async () => ({ success: true, reply: "" }),
    },
    listConversations: async () => [
      { id: "conv-a", title: "历史会话 A", messageCount: 2 },
    ],
    fetchConversation: async () => ({
      id: "conv-a",
      title: "历史会话 A",
      messages: [{ role: "assistant", content: "旧消息" }],
    }),
  });

  controller.init();
  fab.click();
  document.querySelector('[data-claw-assistant-action="toggle-history"]').click();
  await flushPromises();

  assert.equal(document.querySelector(".claw-assistant-history-popover").hidden, false);
  assert.equal(document.querySelector('[data-claw-assistant-topic-id="conv-a"]').textContent.includes("历史会话 A"), true);
});
```

## 7. Task 3: 顶部“新建对话”交互

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: 复用已有 `createNewConversation()`**

当前 `new-topic` 已调用 `createNewConversation()`，保留 action 名即可。需要确保新建后历史弹层关闭：

```js
if (historyPopoverEl) historyPopoverEl.hidden = true;
```

- [ ] **Step 2: 新建会话标题统一为中文**

把乱码标题替换为：

```js
const created = await createConversation("新话题");
const conversation =
  (typeof created === "object" && created) || { id, title: "新话题", messageCount: 0 };
```

- [ ] **Step 3: 保留现有测试并补充 header 入口断言**

更新现有 `"assistant panel creates a new persistent topic and clears visible history"` 测试，点击 header 新建按钮：

```js
document.querySelector('[data-claw-assistant-action="new-topic"]').click();
```

Expected: 仍然创建新 conversation、清空消息、输入框可继续发送。

## 8. Task 4: 输入区上传图片

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.autoload.js`
- Test: `modules/app/appAssistantPanel.test.js`
- Test: `modules/app/appAssistantPanel.autoload.test.js`

- [ ] **Step 1: 新增状态与限制**

在 `createAssistantPanelController()` 内新增：

```js
const uploadReferenceFile =
  typeof options.uploadReferenceFile === "function" ? options.uploadReferenceFile : null;
const MAX_PENDING_UPLOADS = 4;
let pendingUploads = [];
let uploadInputEl = null;
let uploadListEl = null;
```

- [ ] **Step 2: 新增上传 DOM**

在 `form` 中 textarea 前插入上传按钮、隐藏 input 和缩略图容器：

```js
const composerWrap = createElement(documentRef, "div", {
  className: "claw-assistant-composer",
});
uploadInputEl = createElement(documentRef, "input", {
  type: "file",
  hidden: true,
  attributes: { accept: "image/*" },
});
const uploadButton = createIconButton(documentRef, {
  className: "claw-assistant-upload-button",
  action: "upload-image",
  label: "上传图片",
  textContent: "+",
});
uploadListEl = createElement(documentRef, "div", {
  className: "claw-assistant-upload-list",
});
```

结构为：

```js
composerWrap.appendChild(uploadButton);
composerWrap.appendChild(inputEl);
composerWrap.appendChild(sendButtonEl);
form.appendChild(uploadInputEl);
form.appendChild(uploadListEl);
form.appendChild(composerWrap);
```

- [ ] **Step 3: 上传验证与处理**

新增函数：

```js
async function handleImageFiles(files) {
  const incoming = Array.from(files || []).filter((file) =>
    String(file?.type || "").startsWith("image/")
  );
  if (!incoming.length) {
    appendMessage("assistant", "请上传图片文件。", "claw-assistant-message--error");
    return;
  }
  for (const file of incoming.slice(0, MAX_PENDING_UPLOADS - pendingUploads.length)) {
    const saved = uploadReferenceFile ? await uploadReferenceFile(file) : {};
    pendingUploads.push({
      id: `upload_${Date.now()}_${pendingUploads.length}`,
      name: String(file.name || "image"),
      mimeType: String(file.type || "image/*"),
      size: Number(file.size || 0),
      localUrl: asText(saved.localUrl || saved.url || saved.displayUrl),
      thumbUrl: asText(saved.thumbUrl || saved.thumbnailUrl || saved.displayUrl || saved.url),
      displayUrl: asText(saved.displayUrl || saved.localUrl || saved.url),
    });
  }
  renderPendingUploads();
}
```

- [ ] **Step 4: 渲染缩略图与移除按钮**

```js
function renderPendingUploads() {
  if (!uploadListEl) return;
  clearElement(uploadListEl);
  pendingUploads.forEach((upload) => {
    const item = createElement(documentRef, "button", {
      type: "button",
      className: "claw-assistant-upload-chip",
      textContent: upload.name,
      dataset: { clawAssistantUploadId: upload.id },
      attributes: { title: "移除图片" },
    });
    item.addEventListener("click", () => {
      pendingUploads = pendingUploads.filter((entry) => entry.id !== upload.id);
      renderPendingUploads();
    });
    uploadListEl.appendChild(item);
  });
}
```

- [ ] **Step 5: 绑定上传事件**

```js
panelEl
  .querySelector('[data-claw-assistant-action="upload-image"]')
  ?.addEventListener("click", () => uploadInputEl?.click?.());

uploadInputEl?.addEventListener("change", (event) => {
  void handleImageFiles(event.target?.files);
  if (event.target) event.target.value = "";
});
```

- [ ] **Step 6: autoload 注入上传适配器**

在 `appAssistantPanel.autoload.js` 导入：

```js
import { uploadFile } from "../../services/projectService.js";
```

在 `createAssistantPanelOptions()` return 中加入：

```js
uploadReferenceFile: deps.uploadReferenceFile || uploadFile,
```

- [ ] **Step 7: 测试上传状态进入 context**

新增测试使用 `handleImageFiles` 或 fake input change 验证：上传后发送消息，`sentPayloads[0].context.userReferences.uploads[0].name` 等于文件名。

## 9. Task 5: `@` 引用选择器

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.autoload.js`
- Test: `modules/app/appAssistantPanel.test.js`
- Test: `modules/app/appAssistantPanel.autoload.test.js`

- [ ] **Step 1: 新增引用候选注入点**

在 `createAssistantPanelController()` 内新增：

```js
const listReferenceCandidates =
  typeof options.listReferenceCandidates === "function" ? options.listReferenceCandidates : () => [];
let pendingReferences = [];
let referencePopoverEl = null;
let referenceListEl = null;
let referenceChipsEl = null;
```

- [ ] **Step 2: 新增 `@` 按钮和引用 chip 区**

在 composer 中加入：

```js
const referenceButton = createIconButton(documentRef, {
  className: "claw-assistant-reference-button",
  action: "toggle-references",
  label: "引用",
  textContent: "@",
});
referenceChipsEl = createElement(documentRef, "div", {
  className: "claw-assistant-reference-chips",
});
referencePopoverEl = createElement(documentRef, "div", {
  className: "claw-assistant-reference-popover",
  hidden: true,
});
referenceListEl = createElement(documentRef, "div", {
  className: "claw-assistant-reference-list",
});
referencePopoverEl.appendChild(referenceListEl);
form.appendChild(referenceChipsEl);
form.appendChild(referencePopoverEl);
composerWrap.appendChild(referenceButton);
```

- [ ] **Step 3: 渲染候选列表**

候选 item 统一结构：

```js
{
  type: "node",
  id: "node_1",
  label: "主视觉图",
  detail: "source-image",
  nodeType: "source-image"
}
```

渲染函数：

```js
function renderReferenceCandidates() {
  if (!referenceListEl) return;
  clearElement(referenceListEl);
  const candidates = listReferenceCandidates({ uploads: pendingUploads }) || [];
  candidates.forEach((candidate) => {
    const item = createElement(documentRef, "button", {
      type: "button",
      className: "claw-assistant-reference-item",
      textContent: `${candidate.label || candidate.id} ${candidate.detail || ""}`.trim(),
      dataset: {
        clawAssistantReferenceType: candidate.type,
        clawAssistantReferenceId: candidate.id,
      },
    });
    item.addEventListener("click", () => addPendingReference(candidate));
    referenceListEl.appendChild(item);
  });
}
```

- [ ] **Step 4: 引用 chip 管理**

```js
function addPendingReference(candidate) {
  if (!candidate?.id || !candidate?.type) return;
  const key = `${candidate.type}:${candidate.id}`;
  if (!pendingReferences.some((item) => `${item.type}:${item.id}` === key)) {
    pendingReferences.push({ ...candidate });
  }
  if (referencePopoverEl) referencePopoverEl.hidden = true;
  renderPendingReferences();
}

function renderPendingReferences() {
  if (!referenceChipsEl) return;
  clearElement(referenceChipsEl);
  pendingReferences.forEach((reference) => {
    const chip = createElement(documentRef, "button", {
      type: "button",
      className: "claw-assistant-reference-chip",
      textContent: `@${reference.label || reference.id}`,
      dataset: { clawAssistantReferenceKey: `${reference.type}:${reference.id}` },
      attributes: { title: "移除引用" },
    });
    chip.addEventListener("click", () => {
      pendingReferences = pendingReferences.filter(
        (item) => `${item.type}:${item.id}` !== `${reference.type}:${reference.id}`
      );
      renderPendingReferences();
    });
    referenceChipsEl.appendChild(chip);
  });
}
```

- [ ] **Step 5: autoload 构造引用候选**

在 `appAssistantPanel.autoload.js` 新增：

```js
function buildReferenceCandidates({ graphStore, assetManager, uploads = [] }) {
  const graphState = graphStore?.getStateRaw?.() || graphStore?.getState?.() || {};
  const nodes = Object.values(graphState.nodes || {}).slice(0, 40).map((node) => ({
    type: "node",
    id: String(node.id || ""),
    label: asText(node.name || node.title || node.label || node.id),
    detail: asText(node.type),
    nodeType: asText(node.type),
  })).filter((item) => item.id);
  const assets = getAssetManagerAssets(assetManager).slice(0, 40).map((asset) => ({
    type: "asset",
    id: String(asset.id || ""),
    label: asText(asset.name || asset.title || asset.id),
    detail: asText(asset.type || asset.category),
  })).filter((item) => item.id);
  const uploadRefs = uploads.map((upload) => ({
    type: "upload",
    id: upload.id,
    label: upload.name,
    detail: upload.mimeType,
  }));
  return [...uploadRefs, ...nodes, ...assets];
}
```

如果 `getAssetManagerAssets()` 目前只在 `assistantActionExecutor.js` 内部存在，不跨模块复用；在 autoload 中新增一个小型本地版本即可，避免为了本功能改 executor 边界。

- [ ] **Step 6: 绑定 `@` 按钮**

```js
panelEl
  .querySelector('[data-claw-assistant-action="toggle-references"]')
  ?.addEventListener("click", () => {
    renderReferenceCandidates();
    if (referencePopoverEl) referencePopoverEl.hidden = !referencePopoverEl.hidden;
  });
```

## 10. Task 6: 发送时合并上传与引用上下文

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: 新增 context 合并 helper**

```js
function buildContextWithUserReferences() {
  const context = buildContext();
  const userReferences = {};
  if (pendingUploads.length) {
    userReferences.uploads = pendingUploads.map((item) => ({ ...item }));
  }
  if (pendingReferences.length) {
    userReferences.mentions = pendingReferences.map((item) => ({ ...item }));
  }
  if (Object.keys(userReferences).length) {
    return { ...context, userReferences };
  }
  return context;
}
```

- [ ] **Step 2: 替换 `submitMessage()` 中的 context 构造**

把：

```js
context: buildContextWithMemory(),
```

调整为：

```js
context: buildContextWithMemory(buildContextWithUserReferences()),
```

如果现有 `buildContextWithMemory()` 无参数，改为：

```js
function buildContextWithMemory(baseContext = buildContext()) {
  return {
    ...baseContext,
    conversationMemory: getConversationMemory(),
  };
}
```

- [ ] **Step 3: 发送成功后清空本轮引用**

在 assistant response 成功处理后追加：

```js
pendingUploads = [];
pendingReferences = [];
renderPendingUploads();
renderPendingReferences();
```

错误分支不清空。

- [ ] **Step 4: 测试 context**

新增测试断言：

```js
assert.equal(sentPayloads[0].context.userReferences.uploads[0].name, "ref.png");
assert.equal(sentPayloads[0].context.userReferences.mentions[0].id, "node-1");
```

## 11. Task 7: 视觉样式补齐

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Test: Manual visual check

- [ ] **Step 1: Composer 样式**

新增样式：

```css
.claw-assistant-form{
  display:flex;
  flex-direction:column;
  gap:8px;
  padding:12px;
  border-top:1px solid var(--stroke-08,rgba(255,255,255,.08));
  background:rgba(0,0,0,.18);
}
.claw-assistant-composer{
  display:flex;
  align-items:flex-end;
  gap:10px;
  min-height:72px;
  border:1px solid rgba(255,255,255,.12);
  border-radius:18px;
  background:rgba(255,255,255,.055);
  padding:10px;
}
.claw-assistant-upload-button{
  width:48px;
  height:64px;
  flex:0 0 auto;
  border-radius:8px;
}
.claw-assistant-reference-button{
  width:30px;
  height:30px;
  flex:0 0 auto;
  border-radius:8px;
}
.claw-assistant-upload-list,
.claw-assistant-reference-chips{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}
.claw-assistant-upload-chip,
.claw-assistant-reference-chip{
  max-width:180px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  border:1px solid rgba(255,255,255,.12);
  border-radius:999px;
  background:rgba(255,255,255,.07);
  color:var(--text-primary,#fff);
  padding:5px 9px;
  font-size:12px;
}
.claw-assistant-reference-popover{
  max-height:220px;
  overflow:auto;
  border:1px solid rgba(255,255,255,.12);
  border-radius:12px;
  background:rgba(15,15,22,.98);
}
.claw-assistant-reference-item{
  width:100%;
  text-align:left;
  border:0;
  background:transparent;
  color:var(--text-primary,#fff);
  padding:9px 10px;
  cursor:pointer;
}
.claw-assistant-reference-item:hover{
  background:rgba(255,255,255,.08);
}
```

- [ ] **Step 2: 空态不实现技能列表**

本期可以保留现有 messages 区。若必须有截图感，使用一条轻量空态，不放技能项：

```js
appendMessage("assistant", "今天一起创作点什么？");
```

该空态只在新会话且没有历史消息时出现。

## 12. Task 8: 验证

**Files:**

- Test: `modules/app/appAssistantPanel.test.js`
- Test: `modules/app/appAssistantPanel.autoload.test.js`
- Test: `api/clawAssistantApi.test.js`

- [ ] **Step 1: 运行面板相关测试**

Run:

```bash
node --test modules/app/appAssistantPanel.test.js modules/app/appAssistantPanel.autoload.test.js api/clawAssistantApi.test.js
```

Expected: 全部 PASS。

- [ ] **Step 2: 运行完整 JS 测试**

Run:

```bash
npm test
```

Expected: 全部 PASS。

- [ ] **Step 3: 手动检查**

检查项：

- 右下 FAB 打开 RH/Claw 智能体面板。
- 顶部历史按钮能打开历史列表，点击历史项能切换消息。
- 顶部新建按钮能创建空会话并聚焦输入框。
- 上传按钮只接受图片，上传后出现 chip，点击 chip 可移除。
- `@` 按钮能列出当前画布节点、素材、已上传图片，点击后生成 `@xxx` chip。
- 发送成功后上传和引用 chip 清空；发送失败时保留。
- 窄屏宽度下输入区文字、按钮、chip 不重叠。

## 13. 风险与边界

| 风险 | 处理 |
|---|---|
| 现有源码部分中文出现编码乱码 | 本次修改只写正常 UTF-8 中文，不继续传播乱码；测试断言优先使用稳定 selector |
| fake DOM 不支持 file input 的完整行为 | 上传处理逻辑拆成函数，测试直接调用或模拟 `change` 的 `files` |
| 图片真实视觉理解未接入模型 | 本期仅作为引用元数据和本地资源传递；后续如需要 vision message blocks，再扩展 provider payload |
| 历史弹层与旧 topic tools 冲突 | 复用旧状态函数，调整容器，不改后端会话契约 |
| header 图标字符视觉不够像截图 | MVP 用文本符号；若项目后续引入图标库，再替换为统一 icon |

## 14. Acceptance Criteria

- 顶部存在“历史会话”和“新建对话”两个明确图标按钮，位置与截图一致。
- 历史会话读取现有持久化会话接口，不新造一套本地存储。
- 新建对话使用现有 `createClawAssistantConversation()` 链路。
- 输入区支持图片上传、展示、移除，并把上传引用放入 `context.userReferences.uploads`。
- 输入区支持 `@` 引用、展示、移除，并把引用放入 `context.userReferences.mentions`。
- 中间技能列表不实现，不影响现有聊天消息、action preview、自动执行能力。
- `node --test modules/app/appAssistantPanel.test.js modules/app/appAssistantPanel.autoload.test.js api/clawAssistantApi.test.js` 通过。
