import ImageExpandController from "./ImageExpandController.js";
import appStore from "../src/core/stores/appStore.js";
import { resolveImageToolRuntimeModel } from "./toolModelResolutionService.js";
import {
  applyToolModelUiState,
  createToolModelUiState,
} from "./toolModelUiStateService.js";
import { buildStandardImageToolPayload } from "./imageToolGenerationRuntime.js";
import { mountImageToolModelPicker } from "./imageToolModelPicker.js";

const originalInit = ImageExpandController.init;

function getCurrentStoreState() {
  return appStore.getStateRaw?.() || appStore.getState?.() || { nodes: {} };
}

function getNodeData(nodeId) {
  return getCurrentStoreState().nodes?.[nodeId] || null;
}

function findExpandRoot(controller) {
  const candidates = [
    controller?.toolbarEl,
    controller?.overlayEl,
    controller?.rootEl,
    controller?.container,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate.querySelectorAll === "function") {
      return candidate;
    }
  }
  return null;
}

export function buildExpandRegistryPayload({
  sourceNode,
  resolved,
  expandedImageUrl,
  ratioStr,
} = {}) {
  return buildStandardImageToolPayload({
    operation: "expand",
    sourceNode,
    resolved,
    prompt: "Remove the green area and generate a scene that matches the image.",
    inputUrls: [expandedImageUrl],
    aspectRatio: ratioStr === "original" ? "auto" : ratioStr,
    imageSize: sourceNode?.imageSize || "2K",
    batchSize: 1,
  });
}

export function applyExpandResolvedUiState(controller, sourceNode, resolved) {
  const root = findExpandRoot(controller);
  if (!root) {
    return false;
  }

  const runtimeState = resolved || resolveImageToolRuntimeModel(sourceNode || {});
  const changed = applyToolModelUiState(
    root,
    createToolModelUiState(runtimeState, {
      imageSize: sourceNode?.imageSize || controller?.imageSize,
    })
  );

  mountImageToolModelPicker({
    root,
    nodeId: controller?.nodeId,
    nodeData: sourceNode || {},
    store: appStore,
    onChange({ patch }) {
      controller.model = patch.model;
      controller.provider = patch.provider;
      controller.nodeData = {
        ...(controller.nodeData || {}),
        ...patch,
      };
    },
  });

  return changed;
}

ImageExpandController.init = function initRegistryAwareImageExpandController(...args) {
  const result = originalInit.apply(this, args);
  const nodeId = args[0] || this.nodeId;
  const sourceNode = getNodeData(nodeId);
  const resolved = resolveImageToolRuntimeModel(sourceNode || {});

  if (resolved.source === "registry" && resolved.state === "ready") {
    this.model = resolved.model;
    this.provider = resolved.provider;
    this.nodeData = {
      ...(this.nodeData || sourceNode || {}),
      model: resolved.model,
      provider: resolved.provider,
      selectedModelId: resolved.selectedModelId,
      selectedModelNameSnapshot: resolved.selectedModelNameSnapshot,
    };
  }

  applyExpandResolvedUiState(this, sourceNode, resolved);
  return result;
};

export default ImageExpandController;
