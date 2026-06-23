import appStore from "../src/core/stores/appStore.js";
import { generateId as defaultGenerateId } from "../src/core/math.js";
import { commit } from "./history.js";
import { addEdgeWithPolicies } from "./interaction/EdgeController.js";
import { calcSafeSpawnPosNearNode } from "./nodeSpawn.js";
import {
  createPanorama360NodeData,
  PANORAMA_SCENE_DEFAULT_SIZE,
} from "./panoramaSceneNode/sceneNode.js";

export function createPanorama360FromImageNode(
  sourceNodeId,
  {
    store = appStore,
    generateId = defaultGenerateId,
    connectWithPolicies = addEdgeWithPolicies,
    commitHistory = commit,
    focusOnNodes = globalThis.window?.v2FocusOnNodes,
    resolveSpawnPos = calcSafeSpawnPosNearNode,
  } = {}
) {
  const state = store.getStateRaw?.() || store.getState?.() || {};
  const nodes = state.nodes || {};
  const sourceNode = nodes[sourceNodeId];
  if (!sourceNode) {
    throw new Error("找不到原节点");
  }

  const width = PANORAMA_SCENE_DEFAULT_SIZE.width;
  const height = PANORAMA_SCENE_DEFAULT_SIZE.height;
  const pos = resolveSpawnPos(nodes, sourceNode, width, height);
  const targetId = generateId("panorama-360");
  const targetNode = createPanorama360NodeData({
    id: targetId,
    x: pos.x,
    y: pos.y,
    width,
    height,
    name: "360全景图",
  });

  store.addNode(targetNode);

  let connected = false;
  try {
    connected = connectWithPolicies?.({ sourceId: sourceNodeId, targetId }) === true;
  } catch {
    connected = false;
  }
  if (!connected) {
    store.addEdge?.({
      id: generateId("edge"),
      sourceId: sourceNodeId,
      targetId,
      createdAt: Date.now(),
    });
  }

  store.setSelectedNodes?.([targetId]);
  commitHistory?.();
  focusOnNodes?.([sourceNodeId, targetId]);

  return { nodeId: targetId };
}
