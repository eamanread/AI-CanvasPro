import { createAIGenerateNodeUiModule as createLegacyAIGenerateNodeUiModule } from "./uiModule.impl.js";
import { openPromptPresetPicker as defaultOpenPromptPresetPicker } from "../../modules/slashMenu.js";
import {
  COMMON_PROMPT_DEFAULT_LABEL,
  clearPromptPresetSelection,
  handlePromptPresetPillKeyboard,
  rehydratePromptPresetPills,
  syncCommonPromptButtonLabel,
} from "../../modules/promptPresetPillRuntime.js";
import { isHuanyingDebugModeEnabled } from "../../modules/debugMode.js";
import {
  pickCanvasImageLocalPath,
  pickCanvasThumbLocalPath,
} from "../../services/imageDerivativeService.js";

function trimText(value) {
  return String(value ?? "").trim();
}

function withPreviewVersion(localPath, versionSeed) {
  const normalizedPath = trimText(localPath).replace(/^\/+/, "");
  if (!normalizedPath) {
    return "";
  }

  const seed = trimText(versionSeed);
  if (!seed) {
    return normalizedPath;
  }

  const [basePart, hashPart = ""] = normalizedPath.split("#", 2);
  const joiner = basePart.includes("?") ? "&" : "?";
  return `${basePart}${joiner}__aicv=${encodeURIComponent(seed)}${hashPart ? `#${hashPart}` : ""}`;
}

function buildPreviewVersionSeed(nodeData, imageData = null) {
  const image = imageData && typeof imageData === "object" ? imageData : null;
  const parts = [
    trimText(nodeData?.generationStartTime),
    trimText(nodeData?.generationDuration),
    trimText(nodeData?.jobStatus),
    trimText(image?.sourceUrl || image?.imageUrl || image?.thumbUrl),
  ].filter(Boolean);
  return parts.join("|");
}

const BATCH_SIZE_OPTIONS = new Set([1, 2, 4]);

function normalizeBatchSize(value) {
  const numericValue = Math.trunc(Number(value));
  return BATCH_SIZE_OPTIONS.has(numericValue) ? numericValue : 1;
}

function getStoreNodeData(node, store) {
  return store?.getState?.()?.nodes?.[node?.nodeId] || null;
}

function findBatchWraps(node, mountResult = null) {
  const roots = [
    node?.batchWrap,
    node?._root,
    node?.rootEl,
    node?.el,
    node?.containerEl,
    mountResult,
  ].filter(Boolean);
  const wraps = [];

  for (const root of roots) {
    if (root?.classList?.contains?.("batch-wrap")) {
      wraps.push(root);
    }
    if (typeof root?.querySelectorAll === "function") {
      wraps.push(...root.querySelectorAll(".batch-wrap"));
    } else if (typeof root?.querySelector === "function") {
      const wrap = root.querySelector(".batch-wrap");
      if (wrap) {
        wraps.push(wrap);
      }
    }
  }

  return Array.from(new Set(wraps.filter(Boolean)));
}

function setItemActive(item, isActive) {
  if (typeof item?.classList?.toggle === "function") {
    item.classList.toggle("active", isActive);
    return;
  }
  if (isActive) {
    item?.classList?.add?.("active");
  } else {
    item?.classList?.remove?.("active");
  }
}

function syncBatchWrapActiveState(batchWrap, batchSize) {
  const items =
    batchWrap?.querySelectorAll?.(".batch-menu .floating-menu-item[data-value]") ||
    batchWrap?.querySelectorAll?.(".floating-menu-item[data-value]") ||
    [];
  for (const item of items) {
    setItemActive(item, normalizeBatchSize(item?.dataset?.value) === batchSize);
  }
}

function writeBatchSize(node, store, batchSize) {
  if (!node) {
    return;
  }

  node._data = {
    ...(node._data || {}),
    batchSize,
  };

  if (!store || !node.nodeId || typeof store.updateNodeData !== "function") {
    return;
  }

  const storeNodeData = getStoreNodeData(node, store);
  if (storeNodeData?.batchSize === batchSize) {
    return;
  }

  store.updateNodeData(node.nodeId, { batchSize });
}

function getCommonPromptRoot(node, mountResult = null) {
  if (mountResult?.root) {
    return mountResult.root;
  }
  if (mountResult?.querySelector) {
    return mountResult;
  }
  return node?._root || node?.rootEl || node?.el || node?.element || node?.containerEl || null;
}

function findCommonPromptEl(node, root) {
  return node?.promptEl || root?.querySelector?.(".prompt-textarea, [contenteditable='true']") || null;
}

function findFooter(root) {
  return root?.querySelector?.(".prompt-panel-footer, .image-prompt-actions, .prompt-actions") || null;
}

function findImageModelWrap(root, footer) {
  return (
    root?.querySelector?.(".img-model-wrap, [data-role='image-model-selector']") ||
    footer?.querySelector?.(".img-model-wrap, [data-role='image-model-selector']") ||
    null
  );
}

function createCommonPromptButton(documentRef) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "common-prompt-btn";
  button.classList?.add?.("common-prompt-btn");
  button.textContent = COMMON_PROMPT_DEFAULT_LABEL;
  button.title = COMMON_PROMPT_DEFAULT_LABEL;
  Object.assign(button.style || {}, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "28px",
    padding: "5px 10px",
    borderRadius: "999px",
    border: "1px solid var(--stroke-weak, rgba(255,255,255,0.12))",
    background: "var(--action-btn-bg, rgba(255,255,255,0.06))",
    color: "var(--text-primary, inherit)",
    cursor: "var(--pointer-cursor, pointer)",
    whiteSpace: "nowrap",
  });
  return button;
}

function insertAfter(reference, element, fallbackParent) {
  if (!element || element.parentNode) {
    return;
  }
  if (reference?.insertAdjacentElement) {
    reference.insertAdjacentElement("afterend", element);
    return;
  }
  if (reference?.parentNode?.insertBefore) {
    const siblings = Array.from(reference.parentNode.children || []);
    reference.parentNode.insertBefore(element, siblings[siblings.indexOf(reference) + 1] || null);
    return;
  }
  fallbackParent?.appendChild?.(element);
}

function moveFooterControlsToFront(footer, controls) {
  const ordered = controls.filter(Boolean);
  for (const control of [...ordered].reverse()) {
    footer.insertBefore?.(control, footer.children?.[0] || null);
  }
}

function syncImageCommonPromptState(node, store, promptEl, button) {
  const label = syncCommonPromptButtonLabel(promptEl, button, node?._data || {});
  if (!label && node?._data?.promptPresetSelection) {
    clearPromptPresetSelection({
      promptEl,
      nodeId: node?.nodeId || node?._data?.id,
      store,
      buttonEl: button,
    });
    if (node?._data) {
      node._data.promptPresetSelection = null;
    }
  }
}

export function bindImageCommonPromptAndFooterControls(
  node,
  store,
  mountResult = null,
  overrides = {},
) {
  const root = getCommonPromptRoot(node, mountResult);
  const promptEl = findCommonPromptEl(node, root);
  const footer = findFooter(root);
  if (!root || !promptEl || !footer) {
    return null;
  }

  const openPicker = overrides.openPromptPresetPicker || defaultOpenPromptPresetPicker;
  const isDebugModeEnabled = overrides.isDebugModeEnabled || (() => isHuanyingDebugModeEnabled());
  const documentRef = root.ownerDocument || promptEl.ownerDocument || globalThis.document;
  if (!documentRef?.createElement) {
    return null;
  }

  const modelWrap = findImageModelWrap(root, footer);
  let button = footer.querySelector?.(".common-prompt-btn") || null;
  if (!button) {
    button = createCommonPromptButton(documentRef);
    insertAfter(modelWrap, button, footer);
  }

  const qualityWrap = root.querySelector?.(".quality-wrap, .img-quality-wrap, [data-role='image-quality']");
  const ratioWrap = root.querySelector?.(".ratio-wrap, .img-ratio-wrap, [data-role='image-ratio']");
  const batchWrap = root.querySelector?.(".batch-wrap");
  moveFooterControlsToFront(footer, [modelWrap, button, qualityWrap, ratioWrap, batchWrap]);

  if (!button.dataset?.commonPromptBound) {
    if (button.dataset) {
      button.dataset.commonPromptBound = "true";
    }
    button.addEventListener?.("click", (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      openPicker({
        promptEl,
        nodeType: "ai-image",
        nodeId: node?.nodeId || node?._data?.id,
        anchorEl: button,
        commonPromptButtonEl: button,
        onPresetSelected: (preset) => {
          if (node?._data && preset) {
            node._data.promptPresetSelection = {
              title: preset.title,
              template: preset.template,
            };
          }
          syncCommonPromptButtonLabel(promptEl, button, node?._data || {});
        },
      });
    });
  }

  rehydratePromptPresetPills(promptEl, button, node?._data || {});
  syncCommonPromptButtonLabel(promptEl, button, node?._data || {});

  if (!promptEl.dataset?.commonPromptBound) {
    if (promptEl.dataset) {
      promptEl.dataset.commonPromptBound = "true";
    }
    promptEl.addEventListener?.("input", () => syncImageCommonPromptState(node, store, promptEl, button));
    promptEl.addEventListener?.("keydown", (event) => {
      handlePromptPresetPillKeyboard(promptEl, event, {
        nodeId: node?.nodeId || node?._data?.id,
        store,
        buttonEl: button,
        onChange: () => syncImageCommonPromptState(node, store, promptEl, button),
      });
    });
  }

  const debugVisible = Boolean(isDebugModeEnabled());
  root.querySelectorAll?.(".debug-wrench-btn, [data-role='debug-wrench']")?.forEach((debugEl) => {
    debugEl.style.display = debugVisible ? "" : "none";
    debugEl.hidden = !debugVisible;
  });

  return button;
}

export function bindBatchSizeControlStoreSync(node, store, mountResult = null) {
  const batchWraps = findBatchWraps(node, mountResult);
  if (batchWraps.length === 0) {
    return;
  }

  const currentBatchSize = normalizeBatchSize(
    getStoreNodeData(node, store)?.batchSize ?? node?._data?.batchSize
  );

  for (const batchWrap of batchWraps) {
    syncBatchWrapActiveState(batchWrap, currentBatchSize);

    if (batchWrap.__aigenBatchSizeStoreSyncBound) {
      continue;
    }

    batchWrap.__aigenBatchSizeStoreSyncBound = true;
    if (batchWrap.dataset) {
      batchWrap.dataset.batchStoreSyncBound = "true";
    }

    batchWrap.addEventListener?.(
      "click",
      (event) => {
        const target = event?.target;
        const item =
          target?.closest?.(".batch-menu .floating-menu-item[data-value]") ||
          target?.closest?.(".floating-menu-item[data-value]");
        const numericValue = Math.trunc(Number(item?.dataset?.value));
        if (!BATCH_SIZE_OPTIONS.has(numericValue)) {
          return;
        }

        writeBatchSize(node, store, numericValue);
        syncBatchWrapActiveState(batchWrap, numericValue);
      },
      true
    );
  }
}

function decorateImageForPreview(image, nodeData) {
  if (!image || typeof image !== "object") {
    return image;
  }

  const versionSeed = buildPreviewVersionSeed(nodeData, image);
  if (!versionSeed) {
    return image;
  }

  const previewPath = withPreviewVersion(pickCanvasImageLocalPath(image), versionSeed);
  const previewThumbPath = withPreviewVersion(pickCanvasThumbLocalPath(image), versionSeed);
  if (!previewPath && !previewThumbPath) {
    return image;
  }

  return {
    ...image,
    ...(previewPath ? { displayLocalPath: previewPath } : {}),
    ...(previewThumbPath ? { thumbLocalPath: previewThumbPath } : {}),
  };
}

function decorateNodeDataForPreview(data) {
  if (!data || typeof data !== "object") {
    return data;
  }

  let changed = false;
  const nextData = {
    ...data,
  };

  if (Array.isArray(data.images)) {
    const nextImages = data.images.map((image) => {
      const decorated = decorateImageForPreview(image, data);
      if (decorated !== image) {
        changed = true;
      }
      return decorated;
    });
    nextData.images = nextImages;
  }

  const topLevelSeed = buildPreviewVersionSeed(data, data);
  const topLevelPreviewPath = withPreviewVersion(pickCanvasImageLocalPath(data), topLevelSeed);
  const topLevelThumbPath = withPreviewVersion(pickCanvasThumbLocalPath(data), topLevelSeed);
  if (topLevelPreviewPath && topLevelPreviewPath !== trimText(data.displayLocalPath)) {
    nextData.displayLocalPath = topLevelPreviewPath;
    changed = true;
  }
  if (topLevelThumbPath && topLevelThumbPath !== trimText(data.thumbLocalPath)) {
    nextData.thumbLocalPath = topLevelThumbPath;
    changed = true;
  }

  return changed ? nextData : data;
}

function createWrappedModule(legacyModule, overrides) {
  const wrappedModule = {};
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(legacyModule));
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(overrides));
  return wrappedModule;
}

export function createAIGenerateNodeUiModule(deps) {
  const legacyModule = createLegacyAIGenerateNodeUiModule(deps);
  const originalMount = legacyModule.mount;
  const originalLoadAndDisplayImage = legacyModule._loadAndDisplayImage;

  return createWrappedModule(legacyModule, {
    mount(...args) {
      const result = originalMount.apply(this, args);
      bindBatchSizeControlStoreSync(this, deps?.store, result);
      bindImageCommonPromptAndFooterControls(this, deps?.store, result);
      return result;
    },

    async _loadAndDisplayImage() {
      const originalData = this._data;
      const decoratedData = decorateNodeDataForPreview(originalData);
      if (decoratedData === originalData) {
        return originalLoadAndDisplayImage.call(this);
      }

      try {
        this._data = decoratedData;
        return await originalLoadAndDisplayImage.call(this);
      } finally {
        this._data = originalData;
      }
    },
  });
}
