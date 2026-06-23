import { shouldOmitImageSizeParam } from "./imageModelCapabilities.js";
import {
  getNanoBananaSelectionFromModel,
  isNanoBananaFamily,
} from "./nanoBananaModeRules.js";

const MODEL_LABEL_SELECTOR =
  ".img-model-label,.fa-model-label,.tool-model-label,.model-text";
const MODEL_TRIGGER_SELECTOR =
  ".img-model-btn-trigger,.fa-model-btn,[data-model-toggle],.model-toggle";
const LEGACY_MODEL_MENU_SELECTOR =
  ".img-model-menu,.fa-model-menu,.grsai-submenu,.apimart-submenu,.ppio-submenu,.runninghub-submenu,.runninghubwf-submenu,.model-menu";
const NANO_MODE_PANEL_SELECTOR =
  ".fa-nb-mode-wrap,.nb-mode-wrap,[data-capability-panel=\"nano-banana-mode\"]";
const IMAGE_SIZE_CONTROL_SELECTOR =
  "[data-capability-control=\"image-size\"],.fa-image-size-wrap,.img-rp-quality-area";

function trimText(value) {
  return String(value ?? "").trim();
}

function normalizeResolved(resolved) {
  return resolved && typeof resolved === "object" && !Array.isArray(resolved)
    ? resolved
    : {};
}

function queryAll(root, selector) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return [];
  }
  try {
    return Array.from(root.querySelectorAll(selector) || []);
  } catch {
    return [];
  }
}

function setHidden(element, hidden) {
  if (!element?.style) {
    return;
  }
  if (hidden) {
    element.style.display = "none";
    return;
  }
  if (element.style.display === "none") {
    element.style.display = "";
  }
}

function setClass(element, className, enabled) {
  if (!element?.classList) {
    return;
  }
  if (typeof element.classList.toggle === "function") {
    element.classList.toggle(className, enabled);
    return;
  }
  if (enabled) {
    element.classList.add?.(className);
    return;
  }
  element.classList.remove?.(className);
}

function setDisabled(element, disabled) {
  if (!element) {
    return;
  }
  if ("disabled" in element) {
    element.disabled = disabled;
  }
  if (typeof element.setAttribute === "function") {
    element.setAttribute("aria-disabled", disabled ? "true" : "false");
  }
  setClass(element, "is-disabled", disabled);
}

function resolveNanoBananaState(model, imageSize = "2K") {
  const modelId = trimText(model);
  const selection = getNanoBananaSelectionFromModel(modelId, imageSize);
  if (selection?.family && isNanoBananaFamily(selection.family)) {
    return {
      isNanoBanana: true,
      family: selection.family,
      mode: selection.mode || "",
    };
  }

  const normalized = modelId.toLowerCase();
  const looseMatch =
    normalized.includes("nano-banana") ||
    normalized.includes("nanobanana") ||
    normalized.includes("banana");

  return {
    isNanoBanana: looseMatch,
    family: looseMatch ? modelId : "",
    mode: "",
  };
}

export function createToolModelUiState(resolved, options = {}) {
  const source = normalizeResolved(resolved);
  const model = trimText(source.model || source.modelRecord?.modelId);
  const displayLabel =
    trimText(source.displayLabel) ||
    trimText(source.selectedModelNameSnapshot) ||
    trimText(source.modelRecord?.modelName) ||
    trimText(model) ||
    "Unconfigured model";
  const imageSize = trimText(options.imageSize || source.imageSize) || "2K";
  const nanoBananaState = resolveNanoBananaState(model, imageSize);
  const isRegistryBacked = trimText(source.source) === "registry";
  const imageSizeControl =
    source.modelRecord?.capabilities?.imageSizeControl !== false &&
    !shouldOmitImageSizeParam(model);

  return {
    source: trimText(source.source) || "legacy",
    state: trimText(source.state) || "unconfigured",
    provider: trimText(source.provider),
    model,
    modelLabel: displayLabel,
    selectedModelId: trimText(source.selectedModelId),
    isRegistryBacked,
    locksModelSelection: isRegistryBacked,
    capabilities: {
      imageSizeControl,
      nanoBananaModePanel: nanoBananaState.isNanoBanana,
      nanoBananaFamily: nanoBananaState.family,
      nanoBananaMode: nanoBananaState.mode,
    },
  };
}

export function applyToolModelUiState(root, uiState, options = {}) {
  if (!root || !uiState) {
    return false;
  }

  const labelSelector = options.labelSelector || MODEL_LABEL_SELECTOR;
  const triggerSelector = options.triggerSelector || MODEL_TRIGGER_SELECTOR;
  const menuSelector = options.menuSelector || LEGACY_MODEL_MENU_SELECTOR;
  const nanoPanelSelector = options.nanoPanelSelector || NANO_MODE_PANEL_SELECTOR;
  const imageSizeSelector =
    options.imageSizeSelector || IMAGE_SIZE_CONTROL_SELECTOR;

  if (root.dataset) {
    root.dataset.toolModelSource = uiState.source;
    root.dataset.toolModelState = uiState.state;
    root.dataset.toolModelId = uiState.model;
    root.dataset.selectedModelId = uiState.selectedModelId || "";
  }

  setClass(root, "is-registry-model-locked", uiState.locksModelSelection);

  for (const labelEl of queryAll(root, labelSelector)) {
    labelEl.textContent = uiState.modelLabel;
    if ("title" in labelEl) {
      labelEl.title = uiState.modelLabel;
    }
  }

  for (const triggerEl of queryAll(root, triggerSelector)) {
    setDisabled(triggerEl, uiState.locksModelSelection);
    if ("title" in triggerEl) {
      triggerEl.title = uiState.locksModelSelection
        ? uiState.modelLabel
        : triggerEl.title || uiState.modelLabel;
    }
  }

  if (uiState.locksModelSelection) {
    for (const menuEl of queryAll(root, menuSelector)) {
      setHidden(menuEl, true);
    }
  }

  for (const panelEl of queryAll(root, nanoPanelSelector)) {
    setHidden(panelEl, !uiState.capabilities.nanoBananaModePanel);
  }

  for (const controlEl of queryAll(root, imageSizeSelector)) {
    setDisabled(controlEl, !uiState.capabilities.imageSizeControl);
    controlEl.dataset &&
      (controlEl.dataset.capabilityEnabled = uiState.capabilities.imageSizeControl
        ? "true"
        : "false");
  }

  return true;
}
