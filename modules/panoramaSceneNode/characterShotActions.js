import { normalizePanoramaSceneState } from "./sceneNode.js";
import { applyPanoramaSceneViewCommit, setPanoramaSceneMode } from "./sceneNodeActions.js";
import { computeCharacterShotSceneView } from "./characterShotPresets.js";

function resolveStoreState(storeInstance) {
  if (typeof storeInstance?.getStateRaw === "function") return storeInstance.getStateRaw();
  if (typeof storeInstance?.getState === "function") return storeInstance.getState();
  return null;
}

export function applyPanoramaSceneCharacterShot({ nodeId, presetKey, storeInstance } = {}) {
  const state = resolveStoreState(storeInstance);
  const node = state?.nodes?.[nodeId];
  if (!node) return { ok: false, reason: "node-not-found" };

  const sceneState = normalizePanoramaSceneState(node.sceneNode);
  const selection = sceneState.selection || {};
  if (selection.selectedObjectType !== "mannequin" || !selection.selectedObjectId) {
    return { ok: false, reason: "no-mannequin-selected" };
  }
  const selectedCount = Array.isArray(selection.selectedObjects) ? selection.selectedObjects.length : 0;
  if (selectedCount > 1) return { ok: false, reason: "multi-selection" };

  const mannequin = (Array.isArray(sceneState.mannequins) ? sceneState.mannequins : [])
    .find((item) => item?.id === selection.selectedObjectId);
  if (!mannequin) return { ok: false, reason: "mannequin-not-found" };

  if (sceneState.mode === "panorama") {
    setPanoramaSceneMode({ nodeId, mode: "scene", storeInstance });
  }

  const computed = computeCharacterShotSceneView({
    mannequin,
    presetKey,
    currentSceneView: sceneState.viewport?.sceneView ?? null,
  });
  if (!computed.ok) return computed;

  applyPanoramaSceneViewCommit({
    nodeId,
    sceneView: computed.sceneView,
    activeView: "default",
    activeCameraId: null,
    storeInstance,
  });

  return { ok: true, presetKey, sceneView: computed.sceneView };
}
