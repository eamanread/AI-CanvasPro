import appStore from "../src/core/stores/appStore.js";
import { getModelsByNodeType } from "./modelRegistryService.js";
import { filterConfiguredApiModels } from "./modelRegistryFilters.js";
import { getModelMenuSubtitle } from "./modelMenuDescriptions.js";

export const REGISTRY_IMAGE_PROVIDER = "registry-openai";

const LABEL_SELECTOR = ".img-model-label,.fa-model-label,.tool-model-label,.model-text";
const TRIGGER_SELECTOR = ".img-model-btn-trigger,.fa-model-btn,[data-model-toggle],.model-toggle";
const MENU_SELECTOR = ".img-model-menu,.fa-model-menu,.model-menu";

function trimText(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return trimText(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function queryOne(root, selector) {
  if (!root || typeof root.querySelector !== "function") {
    return null;
  }
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function getImageModels(models) {
  return filterConfiguredApiModels(Array.isArray(models) ? models : getModelsByNodeType("image"));
}

export function buildImageToolModelSelectionPatch(model) {
  if (!model || !trimText(model.id)) {
    throw new Error("Image tool model selection requires a registry model id.");
  }

  const label = trimText(model.modelName || model.name || model.id);
  return {
    selectedModelId: trimText(model.id),
    selectedModelNameSnapshot: label,
    modelDeleted: false,
    model: trimText(model.modelId) || label,
    provider: REGISTRY_IMAGE_PROVIDER,
  };
}

export function applyImageToolModelSelection({ nodeId, model, store = appStore }) {
  if (!trimText(nodeId)) {
    throw new Error("Image tool model selection requires nodeId.");
  }
  if (!store || typeof store.updateNodeData !== "function") {
    throw new Error("Image tool model selection requires store.updateNodeData.");
  }

  const patch = buildImageToolModelSelectionPatch(model);
  store.updateNodeData(nodeId, patch);
  return patch;
}

export function renderImageToolModelMenuItems(models = [], selectedModelId = "") {
  return getImageModels(models).map((model) => ({
    id: trimText(model.id),
    label: trimText(model.modelName || model.name || model.id),
    subText: getModelMenuSubtitle(model, { nodeType: "image" }),
    selected: Boolean(trimText(selectedModelId) && trimText(model.id) === trimText(selectedModelId)),
    disabled: Boolean(model.disabled),
  }));
}

export function renderImageToolModelMenuHtml(models = [], selectedModelId = "") {
  const items = renderImageToolModelMenuItems(models, selectedModelId);
  if (items.length === 0) {
    return `
      <div class="floating-menu-item is-empty" data-empty="true" style="cursor:default;opacity:0.7;">
        <div class="fmi-content">
          <div class="fmi-title">No image models configured</div>
          <div class="fmi-sub">Configure image models in API settings first</div>
        </div>
      </div>
    `;
  }

  return items
    .map((item) => {
      const classes = ["floating-menu-item", item.selected ? "active" : "", item.disabled ? "is-disabled" : ""]
        .filter(Boolean)
        .join(" ");
      return `
        <div class="${classes}" data-model-id="${escapeHtml(item.id)}" data-disabled="${item.disabled ? "true" : "false"}">
          <div class="fmi-content">
            <div class="fmi-title">${escapeHtml(item.label)}</div>
            <div class="fmi-sub">${escapeHtml(item.subText)}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

export function mountImageToolModelPicker({
  root,
  nodeId,
  nodeData = {},
  store = appStore,
  models,
  onChange,
  labelSelector = LABEL_SELECTOR,
  triggerSelector = TRIGGER_SELECTOR,
  menuSelector = MENU_SELECTOR,
} = {}) {
  const menuEl = queryOne(root, menuSelector);
  const labelEl = queryOne(root, labelSelector);
  const triggerEl = queryOne(root, triggerSelector);
  if (!menuEl || !labelEl || !triggerEl) {
    return false;
  }

  const availableModels = getImageModels(models);
  const selectedModelId = trimText(nodeData.selectedModelId);
  const selectedModel =
    availableModels.find((model) => trimText(model.id) === selectedModelId) || null;
  const label =
    trimText(selectedModel?.modelName) ||
    trimText(nodeData.selectedModelNameSnapshot) ||
    trimText(nodeData.model) ||
    "Select image model";

  labelEl.textContent = label;
  if ("title" in labelEl) {
    labelEl.title = label;
  }
  if ("title" in triggerEl) {
    triggerEl.title = label;
  }
  if ("disabled" in triggerEl) {
    triggerEl.disabled = availableModels.length === 0;
  }
  triggerEl.setAttribute?.("aria-disabled", availableModels.length === 0 ? "true" : "false");

  const signature = JSON.stringify({
    selectedModelId,
    models: availableModels.map((model) => [
      trimText(model.id),
      trimText(model.modelName || model.name),
      trimText(model.modelId),
    ]),
  });
  if (menuEl.dataset.imageToolPickerSignature !== signature) {
    menuEl.innerHTML = renderImageToolModelMenuHtml(availableModels, selectedModelId);
    menuEl.dataset.imageToolPickerSignature = signature;
  }
  menuEl.__imageToolModels = availableModels;

  if (menuEl.dataset.imageToolPickerBound !== "true") {
    menuEl.dataset.imageToolPickerBound = "true";
    menuEl.addEventListener("click", (event) => {
      const itemEl = event.target.closest?.("[data-model-id]");
      if (!itemEl || itemEl.dataset.disabled === "true") {
        return;
      }
      event.preventDefault?.();
      event.stopPropagation?.();

      const model = (menuEl.__imageToolModels || []).find(
        (entry) => trimText(entry.id) === trimText(itemEl.dataset.modelId)
      );
      if (!model) {
        return;
      }

      const patch = applyImageToolModelSelection({ nodeId, model, store });
      labelEl.textContent = patch.selectedModelNameSnapshot;
      if ("title" in labelEl) {
        labelEl.title = patch.selectedModelNameSnapshot;
      }
      if ("title" in triggerEl) {
        triggerEl.title = patch.selectedModelNameSnapshot;
      }
      menuEl.classList?.remove("show");
      onChange?.({ model, patch });
    });
  }

  return true;
}
