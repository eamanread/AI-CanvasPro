import {
  deletePromptPresetFromServer,
  fetchPromptPresetDefinitionsFromServer,
  fetchPromptPresetsFromServer,
  savePromptPresetDefinitionsToServer,
  savePromptPresetToServer,
} from "../api/index.js";
import {
  PRESET_PACK_EXTENSION,
  decodePresetImportText,
  encodePresetPack,
} from "./preset-pack-codec.js";

const PRESET_SYNC_CHANNEL = "huanying-preset-manager";
const DEFAULT_NODE_TYPES = ["ai-image", "ai-text", "ai-video", "ai-audio"];
const HIDDEN_TEMPLATE_COPY = "提示词内容已隐藏，不在此页面展示。";
const HIDDEN_TEMPLATE_SNIPPET = "提示词内容已隐藏";
const NODE_TYPE_LABELS = {
  "ai-image": "AI 图片节点",
  "ai-text": "AI 文本节点",
  "ai-video": "AI 视频节点",
  "ai-audio": "AI 音频节点",
};

const state = {
  nodeType: "ai-image",
  definitionsByType: {},
  customPresetsByType: {},
  editorTarget: null,
  lastSavedFingerprint: "",
  messageTimer: null,
};

const elements = {
  nodeTypeSelect: document.getElementById("node-type-select"),
  presetRootHint: document.getElementById("preset-root-hint"),
  presetCount: document.getElementById("preset-count"),
  presetList: document.getElementById("preset-list"),
  editorTitle: document.getElementById("editor-title"),
  editorMeta: document.getElementById("editor-meta"),
  sourceChip: document.getElementById("source-chip"),
  statusChip: document.getElementById("status-chip"),
  systemFields: document.getElementById("system-fields"),
  templateField: document.getElementById("template-field"),
  presetTitleInput: document.getElementById("preset-title-input"),
  presetIconInput: document.getElementById("preset-icon-input"),
  presetDescInput: document.getElementById("preset-desc-input"),
  presetTemplateInput: document.getElementById("preset-template-input"),
  fileHint: document.getElementById("file-hint"),
  secondaryHint: document.getElementById("secondary-hint"),
  pageMessage: document.getElementById("page-message"),
  importFileInput: document.getElementById("import-file-input"),
  importButton: document.getElementById("import-button"),
  exportButton: document.getElementById("export-button"),
  refreshButton: document.getElementById("refresh-button"),
  newSystemGroupButton: document.getElementById("new-system-group-button"),
  newSystemButton: document.getElementById("new-system-button"),
  newSubitemButton: document.getElementById("new-subitem-button"),
  saveButton: document.getElementById("save-button"),
  deleteButton: document.getElementById("delete-button"),
};

const syncChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel(PRESET_SYNC_CHANNEL)
    : null;

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizePresetItem(value, { allowSubItems }) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const title = String(value.title || "").trim();
  if (!title) {
    return null;
  }

  const normalized = { title };
  const icon = String(value.icon || "");
  const desc = String(value.desc || "");
  if (icon.trim()) {
    normalized.icon = icon;
  }
  if (desc.trim()) {
    normalized.desc = desc;
  }

  if (allowSubItems && Array.isArray(value.subItems)) {
    normalized.subItems = value.subItems
      .map((item) => normalizePresetItem(item, { allowSubItems: false }))
      .filter(Boolean);
    return normalized;
  }

  const template = String(value.template || "");
  if (!template.trim()) {
    return null;
  }
  normalized.template = template;
  return normalized;
}

function normalizePresetCollection(value, { allowSubItems }) {
  const normalized = {};
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([nodeType, items]) => {
      if (!Array.isArray(items)) {
        return;
      }
      normalized[nodeType] = items
        .map((item) => normalizePresetItem(item, { allowSubItems }))
        .filter(Boolean);
    });
  }
  DEFAULT_NODE_TYPES.forEach((nodeType) => {
    normalized[nodeType] = normalized[nodeType] || [];
  });
  return normalized;
}

function showMessage(message) {
  const { pageMessage } = elements;
  pageMessage.textContent = message;
  pageMessage.classList.add("is-visible");
  window.clearTimeout(state.messageTimer);
  state.messageTimer = window.setTimeout(() => {
    pageMessage.classList.remove("is-visible");
  }, 2800);
}

function updateStatusChip(message, stateName = "saved") {
  elements.statusChip.textContent = message;
  elements.statusChip.classList.toggle("is-dirty", stateName === "dirty");
  elements.statusChip.classList.toggle("is-error", stateName === "error");
}

function updateNodeTypeHint() {
  // 节点类型路径提示已并入弹窗头部, 此处无需展示。
}

function getSystemItems() {
  return state.definitionsByType[state.nodeType] || [];
}

function getCustomPresets() {
  return state.customPresetsByType[state.nodeType] || [];
}

function getSystemItem(itemIndex) {
  return getSystemItems()[itemIndex] || null;
}

function getSystemChild(itemIndex, childIndex) {
  const parent = getSystemItem(itemIndex);
  if (!parent || !Array.isArray(parent.subItems)) {
    return null;
  }
  return parent.subItems[childIndex] || null;
}

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

function createSystemLeafTarget() {
  return {
    source: "system",
    mode: "create",
    kind: "leaf",
    nodeType: state.nodeType,
    itemIndex: null,
    childIndex: null,
    parentItemIndex: null,
  };
}

function createSystemChildTarget(parentItemIndex) {
  return {
    source: "system",
    mode: "create",
    kind: "leaf",
    nodeType: state.nodeType,
    itemIndex: null,
    childIndex: null,
    parentItemIndex,
  };
}

function createSystemEditTarget(itemIndex, childIndex = null) {
  const item = childIndex == null ? getSystemItem(itemIndex) : getSystemChild(itemIndex, childIndex);
  if (!item) {
    return null;
  }
  return {
    source: "system",
    mode: "edit",
    kind: childIndex == null && Array.isArray(item.subItems) ? "group" : "leaf",
    nodeType: state.nodeType,
    itemIndex,
    childIndex,
    parentItemIndex: childIndex == null ? null : itemIndex,
  };
}

function createCustomEditTarget(title) {
  return {
    source: "custom",
    mode: "edit",
    nodeType: state.nodeType,
    title,
  };
}

function getSystemTargetItem(target) {
  if (!target || target.source !== "system") {
    return null;
  }
  if (target.childIndex == null) {
    return getSystemItem(target.itemIndex);
  }
  return getSystemChild(target.itemIndex, target.childIndex);
}

function getSystemGroupContext(target) {
  if (!target || target.source !== "system") {
    return null;
  }
  if (target.mode === "edit" && target.kind === "group") {
    const group = getSystemItem(target.itemIndex);
    return group ? { itemIndex: target.itemIndex, group } : null;
  }
  if (target.parentItemIndex != null) {
    const group = getSystemItem(target.parentItemIndex);
    return group ? { itemIndex: target.parentItemIndex, group } : null;
  }
  return null;
}

function buildTargetKey(target) {
  if (!target) {
    return "";
  }
  if (target.source === "system") {
    if (target.childIndex == null) {
      return `system:${target.itemIndex}`;
    }
    return `system:${target.itemIndex}:${target.childIndex}`;
  }
  if (target.source === "custom") {
    return `custom:${target.title}`;
  }
  return "";
}

function readDraft() {
  return {
    title: elements.presetTitleInput.value,
    icon: elements.presetIconInput.value,
    desc: elements.presetDescInput.value,
    template: elements.presetTemplateInput.value,
  };
}

function buildFingerprint() {
  const target = state.editorTarget;
  const draft = readDraft();
  return JSON.stringify({
    nodeType: state.nodeType,
    source: target?.source || "",
    mode: target?.mode || "",
    kind: target?.kind || "",
    itemIndex: target?.itemIndex ?? null,
    childIndex: target?.childIndex ?? null,
    parentItemIndex: target?.parentItemIndex ?? null,
    title: String(draft.title || "").trim(),
    icon: String(draft.icon || ""),
    desc: String(draft.desc || ""),
  });
}

function isDirty() {
  return buildFingerprint() !== state.lastSavedFingerprint;
}

function appendIconContent(container, icon) {
  container.replaceChildren();
  const raw = String(icon || "").trim();
  if (!raw) {
    return;
  }
  if (raw.startsWith("<svg")) {
    container.innerHTML = raw;
    return;
  }
  container.textContent = raw;
}

function getVisibleSnippetText(item) {
  const desc = String(item?.desc || "").trim();
  if (desc) {
    return desc;
  }
  if (Array.isArray(item?.subItems) && item.subItems.length) {
    return `包含 ${item.subItems.length} 个子预设`;
  }
  return HIDDEN_TEMPLATE_SNIPPET;
}

function getTemplateForTarget(target) {
  if (!target || target.source !== "system" && target.source !== "custom") {
    return "";
  }
  if (target.source === "custom") {
    if (target.mode !== "edit") {
      return "";
    }
    const preset = getCustomPresets().find((item) => item.title === target.title);
    return String(preset?.template || "");
  }

  if (target.kind === "group") {
    return "";
  }
  if (target.mode === "create") {
    return elements.presetTemplateInput.value;
  }
  const item = getSystemTargetItem(target);
  return String(item?.template || "");
}

function renderPresetList() {
  const systemItems = getSystemItems();
  const customItems = getCustomPresets();
  const activeKey = buildTargetKey(state.editorTarget);
  elements.presetCount.textContent = `系统 ${systemItems.length} · 自定义 ${customItems.length}`;

  const content = [];
  content.push(
    createSection({
      title: "系统预设",
      body: systemItems.length
        ? buildSystemTree(systemItems, activeKey)
        : buildEmptyBlock("暂无系统预设"),
    }),
  );
  content.push(
    createSection({
      title: "自定义",
      body: customItems.length
        ? buildCustomTree(customItems, activeKey)
        : buildEmptyBlock("暂无自定义预设"),
    }),
  );

  elements.presetList.replaceChildren(...content);
}

function createSection({ title, body }) {
  const section = document.createElement("section");
  section.className = "preset-section";

  const head = document.createElement("div");
  head.className = "preset-section-head";
  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  head.append(titleEl);

  section.append(head, body);
  return section;
}

function buildEmptyBlock(message) {
  const empty = document.createElement("div");
  empty.className = "preset-list-empty";
  empty.textContent = message;
  return empty;
}

function buildSystemTree(items, activeKey) {
  const tree = document.createElement("div");
  tree.className = "preset-tree";

  items.forEach((item, itemIndex) => {
    const group = document.createElement("div");
    group.className = "preset-tree-group";
    group.append(createSystemCard(item, activeKey, itemIndex, null));

    if (Array.isArray(item.subItems) && item.subItems.length) {
      const children = document.createElement("div");
      children.className = "preset-children";
      item.subItems.forEach((child, childIndex) => {
        children.append(createSystemCard(child, activeKey, itemIndex, childIndex));
      });
      group.append(children);
    }

    tree.append(group);
  });

  return tree;
}

function buildCustomTree(items, activeKey) {
  const tree = document.createElement("div");
  tree.className = "preset-tree";
  items.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-card";
    button.classList.toggle(
      "is-active",
      activeKey === buildTargetKey(createCustomEditTarget(preset.title)),
    );
    button.addEventListener("click", () => {
      setEditorTarget(createCustomEditTarget(preset.title));
    });

    const head = document.createElement("div");
    head.className = "preset-card-head";
    const left = document.createElement("div");
    const titleRow = document.createElement("div");
    titleRow.className = "preset-card-title-row";
    const iconEl = document.createElement("span");
    iconEl.className = "preset-icon";
    iconEl.textContent = "TXT";
    const titleEl = document.createElement("p");
    titleEl.className = "preset-card-title";
    titleEl.textContent = preset.title;
    titleRow.append(iconEl, titleEl);
    left.append(titleRow);

    const meta = document.createElement("div");
    meta.className = "preset-card-title-meta";
    const sourceBadge = document.createElement("span");
    sourceBadge.className = "preset-badge is-custom";
    sourceBadge.textContent = "自定义 TXT";
    meta.append(sourceBadge);

    const snippet = document.createElement("p");
    snippet.className = "preset-card-snippet";
    snippet.textContent = getVisibleSnippetText(preset);

    button.append(head, snippet);
    head.append(left, meta);
    tree.append(button);
  });
  return tree;
}

function createSystemCard(item, activeKey, itemIndex, childIndex) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = childIndex == null ? "preset-card" : "preset-card preset-card--child";

  const target = createSystemEditTarget(itemIndex, childIndex);
  button.classList.toggle("is-active", activeKey === buildTargetKey(target));
  button.addEventListener("click", () => {
    setEditorTarget(target);
  });

  const head = document.createElement("div");
  head.className = "preset-card-head";
  const left = document.createElement("div");

  const titleRow = document.createElement("div");
  titleRow.className = "preset-card-title-row";
  const iconEl = document.createElement("span");
  iconEl.className = "preset-icon";
  appendIconContent(iconEl, item.icon);
  const titleEl = document.createElement("p");
  titleEl.className = "preset-card-title";
  titleEl.textContent = item.title;
  titleRow.append(iconEl, titleEl);
  left.append(titleRow);

  const meta = document.createElement("div");
  meta.className = "preset-card-title-meta";
  const sourceBadge = document.createElement("span");
  sourceBadge.className = "preset-badge";
  sourceBadge.textContent = childIndex == null ? "系统" : "系统子项";
  const kindBadge = document.createElement("span");
  kindBadge.className = `preset-badge ${Array.isArray(item.subItems) ? "is-group" : "is-leaf"}`;
  kindBadge.textContent = Array.isArray(item.subItems) ? "分组" : "叶子";
  meta.append(sourceBadge, kindBadge);

  const snippet = document.createElement("p");
  snippet.className = "preset-card-snippet";
  snippet.textContent = getVisibleSnippetText(item);

  button.append(head, snippet);
  head.append(left, meta);

  if (Array.isArray(item.subItems) && item.subItems.length) {
    const extra = document.createElement("div");
    extra.className = "preset-card-extra";
    extra.textContent = `包含 ${item.subItems.length} 个子预设`;
    button.append(extra);
  }

  return button;
}

function getEditorPresentation(target) {
  if (!target) {
    return {
      title: "预设",
      meta: "选择左侧预设或新建一个条目。",
      sourceLabel: "预设",
      sourceClass: "",
    };
  }

  if (target.source === "custom") {
    return {
      title: target.mode === "edit" ? `编辑自定义预设：${target.title}` : "新建自定义 TXT 预设",
      meta:
        target.mode === "edit"
          ? "该条目会继续落盘到 user/prompt/<nodeType>/*.txt，并在运行时追加到系统预设后面。"
          : "保存后会直接写入对应节点类型的 TXT 目录。",
      sourceLabel: "自定义 TXT",
      sourceClass: "is-custom",
    };
  }

  const groupContext = getSystemGroupContext(target);
  if (target.mode === "create" && target.parentItemIndex != null && groupContext) {
    return {
      title: `为分组「${groupContext.group.title}」新增子预设`,
      meta: "这是系统预设树里的第二层子项，保存后会同步到主画布 slash menu。",
      sourceLabel: "系统子项",
      sourceClass: "",
    };
  }

  if (target.mode === "create" && target.kind === "group") {
    return {
      title: "新建系统分组",
      meta: "系统分组会写入预设树顶层，可以先保存为空分组；后续选中分组后再新增子预设。",
      sourceLabel: "系统分组",
      sourceClass: "",
    };
  }

  if (target.mode === "create") {
    return {
      title: "新建系统叶子预设",
      meta: "系统叶子预设会写入 config/prompt-presets.json，并作为主画布的内置预设使用。",
      sourceLabel: "系统预设",
      sourceClass: "",
    };
  }

  if (target.kind === "group") {
    const item = getSystemTargetItem(target);
    const count = Array.isArray(item?.subItems) ? item.subItems.length : 0;
    return {
      title: `编辑系统分组：${item?.title || ""}`,
      meta: `当前分组包含 ${count} 个子预设。这里编辑的是分组元信息，子预设可在左侧树中单独进入。`,
      sourceLabel: "系统分组",
      sourceClass: "",
    };
  }

  if (target.childIndex != null && groupContext) {
    const item = getSystemTargetItem(target);
    return {
      title: `编辑系统子预设：${item?.title || ""}`,
      meta: `该条目隶属于分组「${groupContext.group.title}」，仍会按原始两层结构同步到运行时。`,
      sourceLabel: "系统子项",
      sourceClass: "",
    };
  }

  const item = getSystemTargetItem(target);
  return {
    title: `编辑系统预设：${item?.title || ""}`,
    meta: "这是系统顶层叶子预设，保存后会直接更新运行时内置预设。",
    sourceLabel: "系统预设",
    sourceClass: "",
  };
}

function updateDerivedHints() {
  // 文件路径/结构说明等解释性提示已移除(交互精简)。落盘逻辑不变。
}

function updateEditorChrome() {
  const target = state.editorTarget;
  const presentation = getEditorPresentation(target);
  elements.editorTitle.textContent = presentation.title;
  elements.sourceChip.textContent = presentation.sourceLabel;
  elements.sourceChip.classList.toggle("is-custom", presentation.sourceClass === "is-custom");

  const isSystemTarget = target?.source === "system";
  const isSystemGroup = isSystemTarget && target.kind === "group";
  const canEditTemplate =
    target?.source === "custom" || (isSystemTarget && target.mode === "create" && target.kind !== "group");
  const groupContext = getSystemGroupContext(target);

  elements.systemFields.classList.toggle("is-hidden", !isSystemTarget);
  elements.templateField.classList.toggle("is-hidden", isSystemGroup);
  elements.presetTemplateInput.readOnly = !canEditTemplate;
  elements.newSubitemButton.disabled = !groupContext;
  elements.deleteButton.disabled = !(target && target.mode === "edit");

  if (!target) {
    updateStatusChip("未选择", "dirty");
  } else if (target.mode === "create") {
    updateStatusChip("未保存", "dirty");
  } else {
    updateStatusChip(isDirty() ? "未保存" : "已同步", isDirty() ? "dirty" : "saved");
  }

  updateDerivedHints();
}

function setEditorTarget(target) {
  state.editorTarget = target;

  if (!target) {
    elements.presetTitleInput.value = "";
    elements.presetIconInput.value = "";
    elements.presetDescInput.value = "";
    elements.presetTemplateInput.value = "";
    state.lastSavedFingerprint = buildFingerprint();
    updateEditorChrome();
    renderPresetList();
    return;
  }

  const item = target.mode === "edit" ? getSystemTargetItem(target) : null;
  const customPreset =
    target.source === "custom" && target.mode === "edit"
      ? getCustomPresets().find((preset) => preset.title === target.title) || null
      : null;

  const sourceValue = target.source === "custom" ? customPreset : item;

  elements.presetTitleInput.value = sourceValue?.title || "";
  elements.presetIconInput.value = sourceValue?.icon || "";
  elements.presetDescInput.value = sourceValue?.desc || "";
  elements.presetTemplateInput.value =
    target.kind === "group" || target.mode === "create"
      ? ""
      : target.source === "custom"
        ? String(sourceValue?.template || "")
        : HIDDEN_TEMPLATE_COPY;

  state.lastSavedFingerprint = buildFingerprint();
  updateEditorChrome();
  renderPresetList();
}

function resolveTarget(target) {
  if (!target || target.nodeType !== state.nodeType) {
    return null;
  }

  if (target.source === "system") {
    if (target.mode === "create") {
      if (target.parentItemIndex != null) {
        return getSystemItem(target.parentItemIndex) ? target : null;
      }
      return target;
    }
    return getSystemTargetItem(target) ? target : null;
  }

  if (target.source === "custom") {
    if (target.mode === "create") {
      return target;
    }
    return getCustomPresets().some((preset) => preset.title === target.title) ? target : null;
  }

  return null;
}

function buildDefaultTarget() {
  if (getSystemItems().length) {
    return createSystemEditTarget(0);
  }
  if (getCustomPresets().length) {
    return createCustomEditTarget(getCustomPresets()[0].title);
  }
  return createSystemLeafTarget();
}

function createNodeTypeOptions() {
  const knownTypes = new Set(DEFAULT_NODE_TYPES);
  Object.keys(state.definitionsByType || {}).forEach((nodeType) => knownTypes.add(nodeType));
  Object.keys(state.customPresetsByType || {}).forEach((nodeType) => knownTypes.add(nodeType));
  elements.nodeTypeSelect.replaceChildren(
    ...Array.from(knownTypes).map((nodeType) => {
      const option = document.createElement("option");
      option.value = nodeType;
      option.textContent = NODE_TYPE_LABELS[nodeType] || nodeType;
      return option;
    }),
  );
  elements.nodeTypeSelect.value = state.nodeType;
}

async function reloadPresets({ preserveCurrent = true, nextTarget = null } = {}) {
  const preferredTarget = nextTarget || (preserveCurrent ? state.editorTarget : null);

  const [definitionsResult, customResult] = await Promise.allSettled([
    fetchPromptPresetDefinitionsFromServer(),
    fetchPromptPresetsFromServer(),
  ]);

  state.definitionsByType = normalizePresetCollection(
    definitionsResult.status === "fulfilled" ? definitionsResult.value : {},
    {
      allowSubItems: true,
    },
  );
  state.customPresetsByType = normalizePresetCollection(
    customResult.status === "fulfilled" ? customResult.value : {},
    {
      allowSubItems: false,
    },
  );

  createNodeTypeOptions();
  updateNodeTypeHint();
  setEditorTarget(resolveTarget(preferredTarget) || buildDefaultTarget());
}

function broadcastPresetChange() {
  const payload = {
    type: "preset-changed",
    nodeType: state.nodeType,
    timestamp: Date.now(),
  };
  syncChannel?.postMessage(payload);
  try {
    localStorage.setItem(PRESET_SYNC_CHANNEL, JSON.stringify(payload));
  } catch {
    // Ignore localStorage failures in restricted contexts.
  }
}

function syncNodeTypeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const requestedNodeType = String(params.get("nodeType") || "").trim();
  if (requestedNodeType) {
    state.nodeType = requestedNodeType;
  }
}

function buildPresetExportFileName() {
  const date = new Date().toISOString().slice(0, 10);
  return `huanying-presets-${date}${PRESET_PACK_EXTENSION}`;
}

function downloadTextFile(fileName, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsText(file, "utf-8");
  });
}

async function handleExportPresets() {
  elements.exportButton.disabled = true;
  updateStatusChip("导出中...");

  try {
    const latestDefinitions = normalizePresetCollection(
      await fetchPromptPresetDefinitionsFromServer(),
      { allowSubItems: true },
    );
    const encoded = await encodePresetPack(latestDefinitions);
    downloadTextFile(buildPresetExportFileName(), encoded);
    updateStatusChip("已同步");
    showMessage("全节点系统预设已导出为加密文件。");
  } catch (error) {
    updateStatusChip("导出失败", "error");
    showMessage(error?.message || "导出失败");
  } finally {
    elements.exportButton.disabled = false;
    updateEditorChrome();
  }
}

async function importPresetFile(file) {
  const text = await readFileAsText(file);
  const definitions = await decodePresetImportText(text);
  await savePromptPresetDefinitionsToServer(definitions);
  state.definitionsByType = normalizePresetCollection(definitions, { allowSubItems: true });
  await reloadPresets({ preserveCurrent: false });
  broadcastPresetChange();
}

async function handleImportPresets(event) {
  const file = event?.target?.files?.[0] || null;
  if (!file) {
    return;
  }

  elements.importButton.disabled = true;
  updateStatusChip("导入中...");

  try {
    await importPresetFile(file);
    updateStatusChip("已同步");
    showMessage("导入成功：全节点系统预设已替换。");
  } catch (error) {
    updateStatusChip("导入失败", "error");
    showMessage(error?.message || "导入失败");
  } finally {
    elements.importButton.disabled = false;
    if (elements.importFileInput) {
      elements.importFileInput.value = "";
    }
    updateEditorChrome();
  }
}

function getSiblingItemsForSystemTarget(target) {
  if (target.parentItemIndex != null) {
    const parent = getSystemItem(target.parentItemIndex);
    return Array.isArray(parent?.subItems) ? parent.subItems : [];
  }
  return getSystemItems();
}

function validateSystemDraft(target, draft) {
  const title = String(draft.title || "").trim();
  if (!title) {
    return "标题不能为空";
  }

  if (target.kind !== "group" && !String(getTemplateForTarget(target) || "").trim()) {
    return "模板不能为空";
  }

  const siblings = getSiblingItemsForSystemTarget(target);
  const isDuplicate = siblings.some((item, index) => {
    if (item.title !== title) {
      return false;
    }
    if (target.mode !== "edit") {
      return true;
    }
    if (target.parentItemIndex != null) {
      return index !== target.childIndex;
    }
    return index !== target.itemIndex;
  });

  if (isDuplicate) {
    return "同级预设标题不能重复";
  }

  return "";
}

function buildSystemItemFromDraft(target, draft) {
  const title = String(draft.title || "").trim();
  const icon = String(draft.icon || "");
  const desc = String(draft.desc || "");

  const item = { title };
  if (icon.trim()) {
    item.icon = icon;
  }
  if (desc.trim()) {
    item.desc = desc;
  }

  if (target.kind === "group") {
    const existing = getSystemTargetItem(target);
    item.subItems = cloneJsonValue(existing?.subItems || []);
    return item;
  }

  item.template = target.mode === "create" ? draft.template : getTemplateForTarget(target);
  return item;
}

function buildNextDefinitionsForSystemSave(target, draft) {
  const nextDefinitions = cloneJsonValue(state.definitionsByType);
  const nextItems = nextDefinitions[state.nodeType] || [];
  nextDefinitions[state.nodeType] = nextItems;
  const nextItem = buildSystemItemFromDraft(target, draft);

  if (target.mode === "edit" && target.childIndex == null) {
    nextItems[target.itemIndex] = nextItem;
    return {
      definitions: nextDefinitions,
      nextTarget: {
        source: "system",
        mode: "edit",
        kind: target.kind,
        nodeType: state.nodeType,
        itemIndex: target.itemIndex,
        childIndex: null,
        parentItemIndex: null,
      },
    };
  }

  if (target.mode === "edit" && target.childIndex != null) {
    const parent = nextItems[target.itemIndex];
    parent.subItems[target.childIndex] = nextItem;
    return {
      definitions: nextDefinitions,
      nextTarget: {
        source: "system",
        mode: "edit",
        kind: "leaf",
        nodeType: state.nodeType,
        itemIndex: target.itemIndex,
        childIndex: target.childIndex,
        parentItemIndex: target.itemIndex,
      },
    };
  }

  if (target.parentItemIndex != null) {
    const parent = nextItems[target.parentItemIndex];
    parent.subItems = Array.isArray(parent.subItems) ? parent.subItems : [];
    parent.subItems.push(nextItem);
    return {
      definitions: nextDefinitions,
      nextTarget: {
        source: "system",
        mode: "edit",
        kind: "leaf",
        nodeType: state.nodeType,
        itemIndex: target.parentItemIndex,
        childIndex: parent.subItems.length - 1,
        parentItemIndex: target.parentItemIndex,
      },
    };
  }

  nextItems.push(nextItem);
  return {
    definitions: nextDefinitions,
    nextTarget: {
      source: "system",
      mode: "edit",
      kind: "leaf",
      nodeType: state.nodeType,
      itemIndex: nextItems.length - 1,
      childIndex: null,
      parentItemIndex: null,
    },
  };
}

async function handleSave() {
  const target = state.editorTarget;
  const draft = readDraft();

  if (!target) {
    return;
  }

  elements.saveButton.disabled = true;
  updateStatusChip("保存中...");

  try {
    if (target.source === "custom") {
      if (!String(draft.title || "").trim()) {
        throw new Error("标题不能为空");
      }
      if (!String(getTemplateForTarget(target) || "").trim()) {
        throw new Error("模板不能为空");
      }

      const result = await savePromptPresetToServer({
        nodeType: state.nodeType,
        title: draft.title,
        originalTitle: target.mode === "edit" ? target.title : "",
        template: getTemplateForTarget(target),
      });
      await reloadPresets({
        preserveCurrent: false,
        nextTarget: createCustomEditTarget(result.title),
      });
      broadcastPresetChange();
      showMessage("自定义 TXT 预设已保存，并已通知主画布刷新。");
      return;
    }

    const validationMessage = validateSystemDraft(target, draft);
    if (validationMessage) {
      throw new Error(validationMessage);
    }

    const { definitions, nextTarget } = buildNextDefinitionsForSystemSave(target, draft);
    await savePromptPresetDefinitionsToServer(definitions);
    await reloadPresets({
      preserveCurrent: false,
      nextTarget,
    });
    broadcastPresetChange();
    showMessage("系统预设树已保存，并已通知主画布刷新。");
  } catch (error) {
    updateStatusChip("保存失败", "error");
    showMessage(error?.message || "保存失败");
  } finally {
    elements.saveButton.disabled = false;
    updateEditorChrome();
  }
}

function buildNextDefinitionsForDelete(target) {
  const nextDefinitions = cloneJsonValue(state.definitionsByType);
  const nextItems = nextDefinitions[state.nodeType] || [];

  if (target.childIndex != null) {
    const parent = nextItems[target.itemIndex];
    if (!Array.isArray(parent?.subItems)) {
      return nextDefinitions;
    }
    parent.subItems.splice(target.childIndex, 1);
    return nextDefinitions;
  }

  nextItems.splice(target.itemIndex, 1);
  return nextDefinitions;
}

async function handleDelete() {
  const target = state.editorTarget;
  if (!target || target.mode !== "edit") {
    return;
  }

  const label =
    target.source === "custom"
      ? target.title
      : getSystemTargetItem(target)?.title || "当前预设";

  if (!window.confirm(`确认删除预设「${label}」吗？`)) {
    return;
  }

  elements.deleteButton.disabled = true;
  updateStatusChip("删除中...");

  try {
    if (target.source === "custom") {
      await deletePromptPresetFromServer(state.nodeType, target.title);
      await reloadPresets({ preserveCurrent: false });
      broadcastPresetChange();
      showMessage("自定义 TXT 预设已删除。");
      return;
    }

    const nextDefinitions = buildNextDefinitionsForDelete(target);
    await savePromptPresetDefinitionsToServer(nextDefinitions);
    await reloadPresets({ preserveCurrent: false });
    broadcastPresetChange();
    showMessage("系统预设树已更新。");
  } catch (error) {
    updateStatusChip("删除失败", "error");
    showMessage(error?.message || "删除失败");
  } finally {
    updateEditorChrome();
  }
}

function handleDraftChange() {
  updateDerivedHints();
  updateStatusChip(isDirty() ? "未保存" : "已同步", isDirty() ? "dirty" : "saved");
}

function startNewSystemGroup() {
  setEditorTarget(createSystemGroupTarget());
  elements.presetTitleInput.focus();
}

function startNewSystemPreset() {
  setEditorTarget(createSystemLeafTarget());
  elements.presetTitleInput.focus();
}

function startNewSubitemPreset() {
  const groupContext = getSystemGroupContext(state.editorTarget);
  if (!groupContext) {
    showMessage("请先选中一个系统分组，再新增子预设。");
    return;
  }
  setEditorTarget(createSystemChildTarget(groupContext.itemIndex));
  elements.presetTitleInput.focus();
}

async function init() {
  syncNodeTypeFromQuery();

  elements.importButton.addEventListener("click", () => {
    elements.importFileInput.click();
  });
  elements.importFileInput.addEventListener("change", handleImportPresets);
  elements.exportButton.addEventListener("click", handleExportPresets);
  elements.refreshButton.addEventListener("click", async () => {
    await reloadPresets();
    showMessage("已重新从本地目录与系统定义文件读取预设。");
  });
  elements.newSystemGroupButton.addEventListener("click", startNewSystemGroup);
  elements.newSystemButton.addEventListener("click", startNewSystemPreset);
  elements.newSubitemButton.addEventListener("click", startNewSubitemPreset);
  elements.saveButton.addEventListener("click", handleSave);
  elements.deleteButton.addEventListener("click", handleDelete);
  elements.nodeTypeSelect.addEventListener("change", async () => {
    state.nodeType = elements.nodeTypeSelect.value || "ai-image";
    await reloadPresets({ preserveCurrent: false });
  });

  [
    elements.presetTitleInput,
    elements.presetIconInput,
    elements.presetDescInput,
    elements.presetTemplateInput,
  ].forEach((element) => {
    element.addEventListener("input", handleDraftChange);
  });

  await reloadPresets({ preserveCurrent: false });
  showMessage("预设管理器已就绪。");
}

// Esc 桥接: 作为应用内弹窗(iframe)内嵌时, 焦点在本页内 Esc 不会冒泡到父级文档,
// 故主动同源 postMessage 通知父窗口关闭弹窗。独立打开时无父级, 不触发。
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: "hy-preset-mgr-close" }, window.location.origin);
    } catch (_) {}
  }
});

init().catch((error) => {
  console.error("[preset-manager] init failed", error);
  updateStatusChip("加载失败", "error");
  showMessage(error?.message || "预设管理器加载失败");
});
