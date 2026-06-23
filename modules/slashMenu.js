import {
  getPromptPresets,
  openCustomPresetsManager,
} from "./promptPresets.js";
import {
  applyPromptPresetSelection,
  syncCommonPromptButtonLabel,
} from "./promptPresetPillRuntime.js";
import store from "../src/core/stores/appStore.js";
import { createSafeSvg } from "../src/utils/dom.js";

const MENU_ID = "v2-slash-menu";
const MENU_OPEN_CLASS = "open";
const ITEM_ACTIVE_CLASS = "active";
const CUSTOM_SUPPORTED_NODE_TYPES = new Set(["ai-text", "ai-image"]);
const TOP_LEVEL_VISIBLE_ROW_COUNT = 3;
const TOP_LEVEL_ROW_HEIGHT = 66;

let slashMenuEl = null;
let outsidePointerHandler = null;
let outsidePointerInstallTimer = null;

function createDefaultMenuState() {
  return {
    context: null,
    presets: [],
    topIndex: 0,
    openGroupIndex: -1,
    childIndex: -1,
    mode: "top",
  };
}

let menuState = createDefaultMenuState();

function trimText(value) {
  return String(value ?? "").trim();
}

function isElementConnected(element) {
  return Boolean(element && (element.isConnected || element.isConnected === undefined));
}

function initializeSlashMenuElement(menu) {
  menu.className = "v2-slash-menu preset-slash-menu";
  Object.assign(menu.style, {
    position: "fixed",
    display: "none",
    minWidth: "320px",
    maxWidth: "360px",
    padding: "8px",
    borderRadius: "16px",
    background: "var(--surface-float, rgba(18,18,26,0.98))",
    border: "1px solid var(--stroke-08, rgba(255,255,255,0.08))",
    boxShadow: "var(--shadow-popover, 0 12px 40px rgba(0,0,0,0.5))",
    backdropFilter: "blur(18px)",
    zIndex: "99999",
    pointerEvents: "auto",
    overflow: "visible",
  });
  menu.removeEventListener("mousedown", handleMenuPointerDown);
  menu.addEventListener("mousedown", handleMenuPointerDown);
}

function ensureSlashMenu() {
  if (isElementConnected(slashMenuEl)) {
    return slashMenuEl;
  }

  slashMenuEl = document.getElementById(MENU_ID);

  if (!slashMenuEl) {
    slashMenuEl = document.createElement("div");
    slashMenuEl.id = MENU_ID;
    document.body.appendChild(slashMenuEl);
  }

  initializeSlashMenuElement(slashMenuEl);

  return slashMenuEl;
}

export function getSlashMenu() {
  return ensureSlashMenu();
}

function resetMenuState() {
  menuState = createDefaultMenuState();
}

function cleanupOutsidePointerHandler() {
  if (outsidePointerInstallTimer) {
    clearTimeout(outsidePointerInstallTimer);
    outsidePointerInstallTimer = null;
  }
  if (!outsidePointerHandler) {
    return;
  }
  document.removeEventListener("mousedown", outsidePointerHandler, true);
  outsidePointerHandler = null;
}

export function closeSlashMenu() {
  const menu = ensureSlashMenu();
  cleanupOutsidePointerHandler();
  menu.classList.remove(MENU_OPEN_CLASS);
  menu.style.display = "none";
  menu.replaceChildren();
  resetMenuState();
}

function installOutsidePointerHandler(menu) {
  cleanupOutsidePointerHandler();
  outsidePointerHandler = (event) => {
    if (menu.contains(event.target)) {
      return;
    }
    closeSlashMenu();
  };
  outsidePointerInstallTimer = setTimeout(() => {
    document.addEventListener("mousedown", outsidePointerHandler, true);
    outsidePointerInstallTimer = null;
  }, 0);
}

function appendPresetIcon(container, iconMarkup) {
  const iconText = trimText(iconMarkup);
  if (!container || !iconText) {
    return;
  }

  if (iconText.startsWith("<svg")) {
    const svg = createSafeSvg(iconText);
    if (svg) {
      container.appendChild(svg);
      container.appendChild(document.createTextNode(" "));
      return;
    }
  }

  container.appendChild(document.createTextNode(`${iconText} `));
}

function getTextNodes(root) {
  const nodes = [];
  if (!root) {
    return nodes;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }
  return nodes;
}

function locateTextPosition(root, targetIndex) {
  const textNodes = getTextNodes(root);
  if (textNodes.length === 0) {
    return null;
  }

  let offset = Math.max(0, Number(targetIndex) || 0);
  for (const textNode of textNodes) {
    const length = String(textNode.textContent || "").length;
    if (offset <= length) {
      return { node: textNode, offset };
    }
    offset -= length;
  }

  const lastNode = textNodes[textNodes.length - 1];
  return {
    node: lastNode,
    offset: String(lastNode.textContent || "").length,
  };
}

function getSlashTriggerContext(promptEl) {
  const selection = window.getSelection();
  if (!promptEl || !selection || selection.rangeCount === 0) {
    return null;
  }

  const caretRange = selection.getRangeAt(0);
  if (!caretRange.collapsed || !promptEl.contains(caretRange.startContainer)) {
    return null;
  }

  const beforeRange = caretRange.cloneRange();
  beforeRange.selectNodeContents(promptEl);
  beforeRange.setEnd(caretRange.startContainer, caretRange.startOffset);

  const beforeText = beforeRange.toString();
  if (!beforeText.endsWith("/")) {
    return null;
  }

  const slashStart = locateTextPosition(promptEl, beforeText.length - 1);
  const slashEnd = locateTextPosition(promptEl, beforeText.length);
  if (!slashStart || !slashEnd) {
    return null;
  }

  const triggerRange = document.createRange();
  triggerRange.setStart(slashStart.node, slashStart.offset);
  triggerRange.setEnd(slashEnd.node, slashEnd.offset);

  return {
    triggerRange,
  };
}

function removeSlashTriggerFromPrompt(context) {
  const triggerRange = context?.triggerRange;
  if (!triggerRange) {
    const promptEl = context?.promptEl;
    if (promptEl && typeof promptEl.textContent === "string" && promptEl.textContent.endsWith("/")) {
      promptEl.textContent = promptEl.textContent.slice(0, -1);
    }
    return;
  }

  const selection = window.getSelection();
  triggerRange.deleteContents();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(triggerRange);
  }
}

function syncPromptValue(nodeId, promptEl) {
  if (!nodeId || !promptEl) {
    return;
  }
  store.updateNodeData(nodeId, { prompt: promptEl.innerHTML });
}

function activateItem(itemList, nextIndex) {
  itemList.forEach((item, index) => {
    item.classList.toggle(ITEM_ACTIVE_CLASS, index === nextIndex);
  });
  if (itemList[nextIndex]) {
    itemList[nextIndex].scrollIntoView({ block: "nearest" });
  }
}

function isPresetGroup(preset) {
  return Array.isArray(preset?.subItems) && preset.subItems.length > 0;
}

function isPresetEmptyGroup(preset) {
  return Array.isArray(preset?.subItems) && preset.subItems.length === 0;
}

function getMenuItems() {
  const menu = ensureSlashMenu();
  return Array.from(menu.querySelectorAll("[data-action]")).filter((item) =>
    item.dataset.slashRole === "top-item" || item.dataset.slashRole === "custom-item"
  );
}

function getSubmenuItems() {
  const menu = ensureSlashMenu();
  return Array.from(menu.querySelectorAll("[data-slash-role='child-item']")).filter((item) => {
    const parentIndex = Number(item.dataset.parentIndex);
    return parentIndex === menuState.openGroupIndex;
  });
}

function getTopItemByPresetIndex(index) {
  return getMenuItems().find((item) => Number(item.dataset.index) === Number(index)) || null;
}

function getSubmenuByPresetIndex(index) {
  const menu = ensureSlashMenu();
  return (
    Array.from(menu.querySelectorAll(".preset-slash-submenu")).find(
      (submenu) => Number(submenu.dataset.parentIndex) === Number(index),
    ) || null
  );
}

function closeSubmenuPanel() {
  const menu = ensureSlashMenu();
  menu.querySelectorAll(".preset-slash-submenu").forEach((submenu) => {
    submenu.classList.remove(MENU_OPEN_CLASS);
    submenu.style.display = "none";
  });
  menuState.openGroupIndex = -1;
  menuState.childIndex = -1;
  menuState.mode = "top";
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

  const activeItem = items[bounded];
  if (activeItem?.dataset.action !== "open-group") {
    closeSubmenuPanel();
  }
}

function setChildIndex(nextIndex) {
  const items = getSubmenuItems();
  if (!items.length) {
    menuState.childIndex = -1;
    return;
  }
  const bounded = ((nextIndex % items.length) + items.length) % items.length;
  menuState.childIndex = bounded;
  activateItem(items, bounded);
}

function clampSubmenuPosition(submenu, parentItem) {
  if (!submenu || !parentItem) {
    return;
  }

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

function openGroupByIndex(index, { enterChild = false } = {}) {
  const preset = menuState.presets[index];
  if (!isPresetGroup(preset)) {
    return false;
  }

  const parentItem = getTopItemByPresetIndex(index);
  const submenu = getSubmenuByPresetIndex(index);
  if (!parentItem || !submenu) {
    return false;
  }

  ensureSlashMenu().querySelectorAll(".preset-slash-submenu").forEach((candidate) => {
    const isActive = candidate === submenu;
    candidate.classList.toggle(MENU_OPEN_CLASS, isActive);
    candidate.style.display = isActive ? "flex" : "none";
  });

  menuState.topIndex = getMenuItems().indexOf(parentItem);
  menuState.openGroupIndex = index;
  menuState.childIndex = 0;
  menuState.mode = enterChild ? "child" : "top";
  activateItem(getMenuItems(), menuState.topIndex);
  activateItem(getSubmenuItems(), enterChild ? 0 : -1);
  clampSubmenuPosition(submenu, parentItem);
  return true;
}

export function applyPromptPresetToPromptEl(template, context, { delayMs = 50 } = {}) {
  const safeTemplate = String(template || "");
  if (!safeTemplate.trim() || !context || typeof context.onGenerate !== "function") {
    return false;
  }
  removeSlashTriggerFromPrompt(context);
  syncPromptValue(context.nodeId, context.promptEl);
  closeSlashMenu();
  setTimeout(() => {
    context.onGenerate(safeTemplate);
  }, delayMs);
  return true;
}

function findCommonPromptButtonForPrompt(promptEl) {
  return (
    promptEl
      ?.closest?.(".node, .node-wrapper, .canvas-node, [data-node-id]")
      ?.querySelector?.(".common-prompt-btn") || null
  );
}

function selectPreset(preset, context) {
  if (!preset || !context?.promptEl) {
    return false;
  }
  removeSlashTriggerFromPrompt(context);
  const applied = applyPromptPresetSelection({
    promptEl: context.promptEl,
    nodeId: context.nodeId,
    store,
    preset,
    buttonEl: context.commonPromptButtonEl || findCommonPromptButtonForPrompt(context.promptEl),
  });
  if (!applied) {
    return false;
  }
  syncCommonPromptButtonLabel(
    context.promptEl,
    context.commonPromptButtonEl || findCommonPromptButtonForPrompt(context.promptEl),
    { promptPresetSelection: { title: preset.title, template: preset.template } },
  );
  closeSlashMenu();
  context.onPresetSelected?.(preset);
  return true;
}

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

function createSubmenuItem(subPreset, parentIndex, childIndex) {
  const item = document.createElement("div");
  item.className = "v2-slash-item preset-slash-item has-desc";
  item.dataset.slashRole = "child-item";
  item.dataset.action = "select-child";
  item.dataset.parentIndex = String(parentIndex);
  item.dataset.childIndex = String(childIndex);
  Object.assign(item.style, {
    flexShrink: "0",
    minHeight: "64px",
  });

  const textWrap = document.createElement("div");
  textWrap.className = "v2-slash-title-wrap preset-slash-title-wrap";

  const title = document.createElement("div");
  title.className = "v2-slash-title preset-slash-title";
  appendPresetIcon(title, subPreset.icon);
  title.appendChild(document.createTextNode(subPreset.title || ""));

  const desc = document.createElement("div");
  desc.className = "v2-slash-desc preset-slash-desc";
  desc.textContent = subPreset.desc || "";

  textWrap.appendChild(title);
  textWrap.appendChild(desc);
  item.appendChild(textWrap);

  item.addEventListener("mouseenter", () => {
    if (menuState.openGroupIndex !== parentIndex) {
      openGroupByIndex(parentIndex, { enterChild: true });
    }
    menuState.mode = "child";
    setChildIndex(childIndex);
  });

  return item;
}

function createSubmenuPanel(preset, parentIndex) {
  const submenu = document.createElement("div");
  submenu.className = "preset-slash-submenu";
  submenu.dataset.parentIndex = String(parentIndex);
  submenu.dataset.slashRole = "submenu";
  Object.assign(submenu.style, {
    position: "absolute",
    left: "calc(100% + 6px)",
    top: "0",
    zIndex: "100001",
    width: "280px",
    minWidth: "280px",
    maxWidth: "calc(100vw - 16px)",
    boxSizing: "border-box",
    background: "var(--surface-float, rgba(18,18,26,0.98))",
    border: "1px solid var(--stroke-08, rgba(255,255,255,0.08))",
    borderRadius: "14px",
    padding: "8px",
    boxShadow: "var(--shadow-popover, 0 12px 40px rgba(0,0,0,0.5))",
    display: "none",
    flexDirection: "column",
    gap: "4px",
    maxHeight: `${TOP_LEVEL_VISIBLE_ROW_COUNT * TOP_LEVEL_ROW_HEIGHT}px`,
    overflowY: "auto",
    overflowX: "hidden",
  });

  const submenuItems = preset.subItems.map((subPreset, childIndex) =>
    createSubmenuItem(subPreset, parentIndex, childIndex),
  );
  submenu.replaceChildren(...submenuItems);
  return submenu;
}

function createTopLevelItem(preset, index) {
  const item = document.createElement("div");
  item.className = `v2-slash-item preset-slash-item has-desc${index === 0 ? ` ${ITEM_ACTIVE_CLASS}` : ""}`;
  item.dataset.slashRole = "top-item";
  item.dataset.action = isPresetGroup(preset)
    ? "open-group"
    : isPresetEmptyGroup(preset)
      ? "empty-group"
      : "select-leaf";
  item.dataset.index = String(index);
  item.style.overflow = "visible";

  const textWrap = document.createElement("div");
  textWrap.className = "v2-slash-title-wrap preset-slash-title-wrap";

  const title = document.createElement("div");
  title.className = "v2-slash-title preset-slash-title";
  appendPresetIcon(title, preset.icon);
  title.appendChild(document.createTextNode(preset.title || ""));

  if (isPresetGroup(preset)) {
    const arrow = document.createElement("span");
    arrow.className = "preset-slash-title-arrow";
    arrow.textContent = ">";
    title.appendChild(arrow);
  }

  const desc = document.createElement("div");
  desc.className = "v2-slash-desc preset-slash-desc";
  desc.textContent = isPresetEmptyGroup(preset)
    ? "暂无子预设"
    : preset.desc || preset.template || "包含多个子预设";

  textWrap.appendChild(title);
  textWrap.appendChild(desc);
  item.appendChild(textWrap);

  item.addEventListener("mouseenter", () => {
    menuState.mode = "top";
    setTopIndex(getMenuItems().indexOf(item));
    if (isPresetGroup(preset)) {
      openGroupByIndex(index);
    }
  });

  return item;
}

function createCustomPresetItem() {
  const item = document.createElement("div");
  item.className = "v2-slash-item preset-slash-item preset-slash-custom has-desc";
  item.dataset.slashRole = "custom-item";
  item.dataset.action = "open-custom-manager";

  const textWrap = document.createElement("div");
  textWrap.className = "v2-slash-title-wrap preset-slash-title-wrap";

  const badge = document.createElement("span");
  badge.className = "preset-slash-badge";
  badge.textContent = "外部 Web 预设管理器";

  const helper = document.createElement("span");
  helper.className = "preset-slash-custom-first";
  helper.textContent = "编辑或创建当前节点预设";

  textWrap.appendChild(badge);
  textWrap.appendChild(helper);
  item.appendChild(textWrap);

  item.addEventListener("mouseenter", () => {
    menuState.mode = "top";
    setTopIndex(getMenuItems().indexOf(item));
  });

  return item;
}

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
    selectPreset(preset, menuState.context);
    return;
  }

  if (action === "open-group") {
    openGroupByIndex(Number(actionEl.dataset.index));
    return;
  }

  if (action === "empty-group") {
    return;
  }

  if (action === "select-child") {
    const parent = menuState.presets[Number(actionEl.dataset.parentIndex)];
    const child = parent?.subItems?.[Number(actionEl.dataset.childIndex)];
    selectPreset(child, menuState.context);
    return;
  }

  if (action === "open-custom-manager") {
    openCustomPresetManagerForContext(menuState.context);
  }
}

function positionMenu(menu, promptEl, anchorEl = null) {
  const promptRect = (anchorEl || promptEl).getBoundingClientRect();
  menu.style.transformOrigin = "top left";
  menu.classList.add(MENU_OPEN_CLASS);
  menu.style.display = "block";
  menu.style.left = `${promptRect.left}px`;
  menu.style.visibility = "hidden";

  const menuHeight = menu.offsetHeight || 280;
  const top = promptRect.top - menuHeight < 0 ? promptRect.bottom + 8 : promptRect.top - menuHeight - 8;
  menu.style.top = `${top}px`;
  menu.style.visibility = "visible";
}

function renderMenu(presets, context, { includeCustomManager = true, anchorEl = null } = {}) {
  const menu = ensureSlashMenu();
  menuState = {
    ...createDefaultMenuState(),
    context,
    presets,
  };
  menu.replaceChildren();

  if (presets.length > 0) {
    const header = document.createElement("div");
    header.className = "preset-slash-header";
    Object.assign(header.style, {
      padding: "6px 10px 8px",
      color: "var(--text-secondary, rgba(255,255,255,0.7))",
      fontSize: "12px",
      fontWeight: "600",
    });
    header.textContent = "选择预设生成";
    menu.appendChild(header);
  }

  const topLevelItems = presets.map((preset, index) => createTopLevelItem(preset, index));

  if (includeCustomManager && CUSTOM_SUPPORTED_NODE_TYPES.has(context.nodeType)) {
    topLevelItems.push(createCustomPresetItem());
  }

  if (topLevelItems.length > 0) {
    menu.appendChild(createTopLevelScrollRegion(topLevelItems));
  }

  presets.forEach((preset, index) => {
    if (isPresetGroup(preset)) {
      menu.appendChild(createSubmenuPanel(preset, index));
    }
  });

  setTopIndex(0);
  positionMenu(menu, context.promptEl, anchorEl);
  installOutsidePointerHandler(menu);
}

export function openPromptPresetPicker({
  promptEl,
  nodeType = "ai-image",
  nodeId = null,
  anchorEl = null,
  commonPromptButtonEl = null,
  onPresetSelected = null,
} = {}) {
  if (!promptEl) {
    return false;
  }
  const presets = getPromptPresets(nodeType);
  renderMenu(
    presets,
    {
      promptEl,
      nodeType,
      nodeId,
      commonPromptButtonEl,
      onPresetSelected,
    },
    { includeCustomManager: false, anchorEl },
  );
  return true;
}

export function checkSlashTrigger(
  event,
  { promptEl, nodeType, nodeId, onGenerate, onPresetSelected, commonPromptButtonEl } = {},
) {
  if (!promptEl) {
    return;
  }
  if (event?.inputType === "insertCompositionText") {
    return;
  }

  const triggerContext = getSlashTriggerContext(promptEl);
  if (!triggerContext) {
    closeSlashMenu();
    return;
  }

  const presets = getPromptPresets(nodeType);
  renderMenu(presets, {
    ...triggerContext,
    promptEl,
    nodeId,
    nodeType,
    onGenerate,
    onPresetSelected,
    commonPromptButtonEl,
  });
}

export function handleSlashKeyboardNavigation(event) {
  const menu = ensureSlashMenu();
  if (!menu.classList.contains(MENU_OPEN_CLASS) && menu.style.display === "none") {
    return false;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeSlashMenu();
    return true;
  }

  if (menuState.mode === "child") {
    const childItems = getSubmenuItems();
    if (!childItems.length) {
      menuState.mode = "top";
      return true;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      menuState.mode = "top";
      activateItem(childItems, -1);
      activateItem(getMenuItems(), menuState.topIndex);
      return true;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setChildIndex(menuState.childIndex + 1);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setChildIndex(menuState.childIndex - 1);
      return true;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const childItem = childItems[menuState.childIndex] || childItems[0];
      const parent = menuState.presets[Number(childItem.dataset.parentIndex)];
      const child = parent?.subItems?.[Number(childItem.dataset.childIndex)];
      selectPreset(child, menuState.context);
      return true;
    }

    return false;
  }

  const topLevelItems = getMenuItems();
  if (!topLevelItems.length) {
    return false;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    setTopIndex(menuState.topIndex + 1);
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    setTopIndex(menuState.topIndex - 1);
    return true;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    const activeItem = topLevelItems[menuState.topIndex] || topLevelItems[0];
    if (activeItem?.dataset.action === "open-group") {
      openGroupByIndex(Number(activeItem.dataset.index), { enterChild: true });
    }
    return true;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const activeItem = topLevelItems[menuState.topIndex] || topLevelItems[0];
    if (activeItem?.dataset.action === "open-group") {
      openGroupByIndex(Number(activeItem.dataset.index), { enterChild: true });
      return true;
    }
    if (activeItem?.dataset.action === "select-leaf") {
      const preset = menuState.presets[Number(activeItem.dataset.index)];
      selectPreset(preset, menuState.context);
      return true;
    }
    if (activeItem?.dataset.action === "empty-group") {
      return true;
    }
    if (activeItem?.dataset.action === "open-custom-manager") {
      openCustomPresetManagerForContext(menuState.context);
      return true;
    }
  }

  return false;
}
