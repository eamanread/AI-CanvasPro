// 背景源 → 本地上传：把本地图片落成 panorama-360 节点，连到当前 3D导演台(panorama-scene)。
// 复用既有真实链路（plan 项4 已实现的内核）：
//   createPanorama360NodeData（节点工厂，panorama360Node.panorama 承载图）
//   addEdgeWithPolicies（panorama-360 → panorama-scene 连边，含 seam 校验）
//   syncPanoramaSceneFromIncomingEdges（500ms 轮询，把入边全景写入 sceneNode.panorama，环境运行时渲染）
// 不伪造：图片来源是用户真实文件（object URL），边同步是已挂载的真实 poller。
import appStore from "../src/core/stores/appStore.js";
import { generateId as defaultGenerateId } from "../src/core/math.js";
import { commit as defaultCommit } from "./history.js";
import { addEdgeWithPolicies } from "./interaction/EdgeController.js";
import { calcSafeSpawnPosNearNode } from "./nodeSpawn.js";
import {
  createPanorama360NodeData,
  isPanoramaSceneNodeType,
  PANORAMA_360_DEFAULT_NAME,
  PANORAMA_SCENE_DEFAULT_SIZE,
} from "./panoramaSceneNode/sceneNode.js";

// 纯逻辑（可测）：构造一个携带本地图的 panorama-360 节点 + 它到场景节点的边。
// imageUrl = 本地文件的可访问 URL（object URL / dataURL）；fileName 仅展示用。
export function buildPanorama360NodeWithImage({
  id,
  sceneNode,
  imageUrl,
  fileName,
  resolveSpawnPos = calcSafeSpawnPosNearNode,
  nodes = {},
}) {
  const width = PANORAMA_SCENE_DEFAULT_SIZE.width;
  const height = PANORAMA_SCENE_DEFAULT_SIZE.height;
  const pos = resolveSpawnPos(nodes, sceneNode, width, height);
  const node = createPanorama360NodeData({
    id,
    x: pos.x,
    y: pos.y,
    width,
    height,
    name: fileName ? `360·${fileName}` : PANORAMA_360_DEFAULT_NAME,
  });
  // 注入本地图：edge-sync 的 resolvePanorama360Payload 读 panorama360Node.panorama.imageUrl
  node.panorama360Node = {
    ...node.panorama360Node,
    panorama: {
      ...node.panorama360Node.panorama,
      imageUrl: imageUrl || null,
      fileName: fileName || null,
    },
  };
  return node;
}

// 编排：建 360 节点 + 加节点 + 连边到场景节点（边同步轮询随后喂入场景背景）。
// 返回 { nodeId }（新建的 panorama-360 节点 id）。
export function createPanorama360BackgroundFromLocalImage(
  sceneNodeId,
  { imageUrl, fileName } = {},
  {
    store = appStore,
    generateId = defaultGenerateId,
    connectWithPolicies = addEdgeWithPolicies,
    commitHistory = defaultCommit,
    resolveSpawnPos = calcSafeSpawnPosNearNode,
    focusOnNodes = globalThis.window?.v2FocusOnNodes,
  } = {}
) {
  const state = store.getStateRaw?.() || store.getState?.() || {};
  const nodes = state.nodes || {};
  const sceneNode = nodes[sceneNodeId];
  if (!sceneNode || !isPanoramaSceneNodeType(sceneNode.type)) {
    throw new Error("当前不是 3D 导演台节点");
  }
  if (!imageUrl) throw new Error("未读到本地图片");

  const targetId = generateId("panorama-360");
  const node = buildPanorama360NodeWithImage({
    id: targetId,
    sceneNode,
    imageUrl,
    fileName,
    resolveSpawnPos,
    nodes,
  });
  store.addNode(node);

  let connected = false;
  try {
    // 360 → scene（EdgeController seam：panorama-scene 只收 panorama-360）
    connected = connectWithPolicies?.({ sourceId: targetId, targetId: sceneNodeId }) === true;
  } catch {
    connected = false;
  }
  if (!connected) {
    store.addEdge?.({
      id: generateId("edge"),
      sourceId: targetId,
      targetId: sceneNodeId,
      createdAt: Date.now(),
    });
  }
  commitHistory?.();
  focusOnNodes?.([sceneNodeId, targetId]);
  return { nodeId: targetId };
}

// 浏览器侧：弹本地文件选择器 → object URL → 编排建节点连边。
// 仅在 DOM 环境调用（autoload 背景源弹窗"本地上传"）。
export function pickLocalImageAndCreatePanoramaBackground(sceneNodeId, deps = {}) {
  if (typeof document === "undefined") throw new Error("无 DOM 环境");
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) {
      try {
        const imageUrl = URL.createObjectURL(file);
        createPanorama360BackgroundFromLocalImage(sceneNodeId, { imageUrl, fileName: file.name }, deps);
        globalThis.window?.showToast?.("本地全景已连接到导演台", "success");
      } catch (error) {
        globalThis.window?.showToast?.(error?.message || "本地全景连接失败", "error");
      }
    }
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}
