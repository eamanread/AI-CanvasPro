import { resolvePromptPresetTemplate } from "./promptPresetTemplate.js";

export const PROMPT_PRESET_PILL_CLASS = "prompt-preset-pill";
export const PROMPT_PRESET_PILL_SELECTOR = ".prompt-preset-pill";
export const COMMON_PROMPT_DEFAULT_LABEL = "\u5e38\u7528\u63d0\u793a\u8bcd";

function toText(value) {
  return String(value ?? "").trim();
}

function getDocumentForPrompt(promptEl) {
  return promptEl?.ownerDocument || globalThis.document || null;
}

function getPromptHtml(promptEl) {
  if (!promptEl) {
    return "";
  }
  return typeof promptEl.innerHTML === "string" ? promptEl.innerHTML : String(promptEl.textContent || "");
}

function persistPromptSelection(store, nodeId, promptEl, selection) {
  if (!store || !nodeId || typeof store.updateNodeData !== "function") {
    return;
  }
  store.updateNodeData(nodeId, {
    prompt: getPromptHtml(promptEl),
    promptPresetSelection: selection,
  });
}

function setButtonLabel(buttonEl, label) {
  if (!buttonEl) {
    return;
  }
  const text = toText(label) || COMMON_PROMPT_DEFAULT_LABEL;
  buttonEl.textContent = text; // 标签为文本节点 → buttonEl.textContent 恒等于 text(取值/测试依赖)
  const selected = text !== COMMON_PROMPT_DEFAULT_LABEL;
  buttonEl.classList?.toggle?.("is-preset-selected", selected);
  if (buttonEl.title !== undefined) {
    buttonEl.title = text;
  }
  // 需求: 选中后保留预设名 + 加「×」清除(CSS 仅选中态显示); 未选中显示下拉箭头(CSS ::after)提示可点选。
  // 「×」用无文本子元素(× 由 CSS 绘制), 故 buttonEl.textContent 仍恒等于 text。
  const documentRef = buttonEl.ownerDocument || globalThis.document;
  if (documentRef?.createElement && buttonEl.appendChild) {
    const clear = documentRef.createElement("span");
    clear.className = "common-prompt-btn__clear";
    clear.setAttribute("role", "button");
    clear.setAttribute("aria-label", "清除常用提示词");
    clear.setAttribute("data-prompt-preset-clear", "1");
    buttonEl.appendChild(clear);
  }
}

function createPresetPill(promptEl, title) {
  const documentRef = getDocumentForPrompt(promptEl);
  if (!documentRef?.createElement) {
    return null;
  }
  const pill = documentRef.createElement("span");
  pill.className = PROMPT_PRESET_PILL_CLASS;
  pill.setAttribute("contenteditable", "false");
  pill.setAttribute("data-prompt-preset-title", title);
  pill.textContent = title;
  // 需求: 输入框内预设词作整体 chip —— 前置图标(CSS ::before) + 标题 + 可点「×」删除。
  // 「×」用无文本子元素(× 由 CSS 绘制), 故 pill.textContent 仍恒等于 title, 不影响取值/测试。
  const remove = documentRef.createElement("span");
  remove.className = "prompt-preset-pill__remove";
  remove.setAttribute("contenteditable", "false");
  remove.setAttribute("role", "button");
  remove.setAttribute("aria-label", "移除常用提示词");
  remove.setAttribute("data-prompt-preset-remove", "1");
  pill.appendChild?.(remove);
  return pill;
}

function removeExistingPresetPills(promptEl) {
  promptEl?.querySelectorAll?.(PROMPT_PRESET_PILL_SELECTOR)?.forEach((pill) => pill.remove?.());
}

function insertPill(promptEl, pill, triggerRange = null) {
  if (!promptEl || !pill) {
    return false;
  }
  if (triggerRange?.deleteContents) {
    triggerRange.deleteContents();
  }
  if (triggerRange?.insertNode) {
    triggerRange.insertNode(pill);
    return true;
  }
  promptEl.appendChild?.(pill);
  return true;
}

function getMatchingSelection(promptEl, nodeData = {}) {
  const selection = nodeData?.promptPresetSelection;
  if (!selection || typeof selection !== "object") {
    return null;
  }
  const title = toText(selection.title);
  if (!title) {
    return null;
  }
  const pill = promptEl?.querySelector?.(PROMPT_PRESET_PILL_SELECTOR);
  if (!pill) {
    return null;
  }
  const pillTitle = toText(pill.getAttribute?.("data-prompt-preset-title") || pill.textContent);
  if (pillTitle !== title) {
    return null;
  }
  return {
    title,
    template: String(selection.template ?? ""),
  };
}

function getTextWithoutPresetPills(promptEl, fallbackText = "") {
  if (!promptEl?.cloneNode) {
    return toText(fallbackText);
  }
  const clone = promptEl.cloneNode(true);
  clone.querySelectorAll?.(PROMPT_PRESET_PILL_SELECTOR)?.forEach((pill) => pill.remove?.());
  return toText(clone.textContent || fallbackText);
}

export function applyPromptPresetSelection({
  promptEl,
  nodeId,
  store,
  preset,
  buttonEl = null,
  triggerRange = null,
} = {}) {
  const title = toText(preset?.title);
  if (!promptEl || !title) {
    return false;
  }
  const template = String(preset?.template ?? "");
  const pill = createPresetPill(promptEl, title);
  if (!pill) {
    return false;
  }

  removeExistingPresetPills(promptEl);
  insertPill(promptEl, pill, triggerRange);

  const selection = { title, template };
  setButtonLabel(buttonEl, title);
  persistPromptSelection(store, nodeId, promptEl, selection);
  return true;
}

export function getPromptTextWithPresetSelection({
  promptEl,
  nodeData = {},
  fallbackText = "",
  context = {},
} = {}) {
  const userInput = getTextWithoutPresetPills(promptEl, fallbackText);
  const selection = getMatchingSelection(promptEl, nodeData);
  if (!selection) {
    return userInput;
  }
  return resolvePromptPresetTemplate(selection.template, userInput, context);
}

export function rehydratePromptPresetPills(promptEl, buttonEl = null, nodeData = {}) {
  if (!promptEl || promptEl.querySelector?.(PROMPT_PRESET_PILL_SELECTOR)) {
    syncCommonPromptButtonLabel(promptEl, buttonEl, nodeData);
    return false;
  }
  const selection = nodeData?.promptPresetSelection;
  const title = toText(selection?.title);
  if (!title) {
    syncCommonPromptButtonLabel(promptEl, buttonEl, nodeData);
    return false;
  }
  const pill = createPresetPill(promptEl, title);
  if (!pill) {
    return false;
  }
  promptEl.appendChild?.(pill);
  syncCommonPromptButtonLabel(promptEl, buttonEl, nodeData);
  return true;
}

export function syncCommonPromptButtonLabel(promptEl, buttonEl, nodeData = {}) {
  const selection = getMatchingSelection(promptEl, nodeData);
  setButtonLabel(buttonEl, selection?.title || COMMON_PROMPT_DEFAULT_LABEL);
  return selection?.title || "";
}

export function clearPromptPresetSelection({ promptEl, nodeId, store, buttonEl } = {}) {
  removeExistingPresetPills(promptEl);
  setButtonLabel(buttonEl, COMMON_PROMPT_DEFAULT_LABEL);
  persistPromptSelection(store, nodeId, promptEl, null);
}

export function handlePromptPresetPillKeyboard(
  promptEl,
  event,
  { nodeId = null, store = null, buttonEl = null, onChange } = {},
) {
  const target = event?.target;
  const pill = target?.closest?.(PROMPT_PRESET_PILL_SELECTOR) ||
    (target?.matches?.(PROMPT_PRESET_PILL_SELECTOR) ? target : null);
  if (!pill || !["Backspace", "Delete"].includes(event?.key)) {
    return false;
  }
  event.preventDefault?.();
  event.stopPropagation?.();
  pill.remove?.();
  setButtonLabel(buttonEl, COMMON_PROMPT_DEFAULT_LABEL);
  persistPromptSelection(store, nodeId, promptEl, null);
  onChange?.();
  return true;
}
