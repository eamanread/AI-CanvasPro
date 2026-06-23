import appStore from "../src/core/stores/appStore.js";
import { createPanorama360FromImageNode } from "./createPanorama360FromImageNode.js";

const IMAGE_NODE_TYPES = new Set(["source-image", "ai-image", "image"]);

function getState() {
  return appStore.getStateRaw?.() || appStore.getState?.() || {};
}

function isImageNode(node) {
  return IMAGE_NODE_TYPES.has(String(node?.type || "").trim());
}

function resolveSelectedImageNodeId() {
  const state = getState();
  const nodes = state.nodes || {};
  const selectedIds = Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : [];
  return selectedIds.find((id) => isImageNode(nodes[id])) || "";
}

function bindPanorama360DirectToolbarAction() {
  if (typeof document === "undefined" || !document.addEventListener) return;
  if (globalThis.__huanyingPanorama360DirectToolbarBound) return;
  globalThis.__huanyingPanorama360DirectToolbarBound = true;

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest?.(".act-panorama-360");
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      try {
        const nodeId = resolveSelectedImageNodeId();
        createPanorama360FromImageNode(nodeId);
        globalThis.window?.showToast?.("360全景图节点已创建", "success");
      } catch (error) {
        globalThis.window?.showToast?.(error?.message || "360全景图节点创建失败", "error");
      }
    },
    true
  );
}

bindPanorama360DirectToolbarAction();
