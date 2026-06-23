// 全景图节点(panorama-360) → 3D导演台(panorama-scene) 连线同步（文档 §13）
// 轮询比对签名：360 节点的全景图变化时写入导演台 sceneNode.panorama（环境运行时随即渲染）。
// 签名带 "edge:" 前缀标记连线来源——断边/源图移除时仅清空连线来源的全景，
// 用户经"上传全景图"手动设置的（无前缀）永不被本模块触碰。
import {
  isPanorama360NodeType,
  isPanoramaSceneNodeType,
} from "./sceneNode.js";

export const PANORAMA_EDGE_SIGNATURE_PREFIX = "edge:";

export function buildPanoramaEdgeSignature(sourceId, payload) {
  const media = String(payload?.imageUrl || payload?.localPath || "");
  return `${PANORAMA_EDGE_SIGNATURE_PREFIX}${sourceId}:${media}`;
}

export function resolvePanorama360Payload(sourceNode) {
  if (!sourceNode || !isPanorama360NodeType(sourceNode.type)) return null;
  const pano = sourceNode.panorama360Node?.panorama;
  const imageUrl = String(pano?.imageUrl || "").trim();
  const localPath = String(pano?.localPath || "").trim();
  if (!imageUrl && !localPath) return null;
  return {
    imageUrl: imageUrl || null,
    localPath: localPath || null,
    fileName: pano?.fileName || null,
  };
}

function resolveStoreState(storeInstance) {
  if (typeof storeInstance?.getStateRaw === "function") return storeInstance.getStateRaw();
  if (typeof storeInstance?.getState === "function") return storeInstance.getState();
  return null;
}

export function syncPanoramaSceneFromIncomingEdges({ storeInstance } = {}) {
  const state = resolveStoreState(storeInstance);
  const nodes = state?.nodes;
  if (!nodes || typeof storeInstance?.updateNodeData !== "function") return [];
  const edgeList = Array.isArray(state.edges) ? state.edges : Object.values(state.edges || {});
  const updates = [];

  for (const node of Object.values(nodes)) {
    if (!node || !isPanoramaSceneNodeType(node.type)) continue;

    // 多条入边时取列表中最后一个有效全景源（最近连接优先）
    let candidate = null;
    for (const edge of edgeList) {
      if (!edge || String(edge.targetId) !== String(node.id)) continue;
      const sourceNode = nodes[edge.sourceId];
      const payload = resolvePanorama360Payload(sourceNode);
      if (payload) candidate = { sourceId: String(sourceNode.id), payload };
    }

    const sceneState = node.sceneNode && typeof node.sceneNode === "object" ? node.sceneNode : {};
    const currentSignature = String(sceneState.panorama?.sourceSignature || "");

    if (candidate) {
      const signature = buildPanoramaEdgeSignature(candidate.sourceId, candidate.payload);
      if (signature === currentSignature) continue;
      storeInstance.updateNodeData(node.id, {
        sceneNode: {
          ...sceneState,
          panorama: {
            localPath: candidate.payload.localPath,
            imageUrl: candidate.payload.imageUrl,
            fileName: candidate.payload.fileName,
            sourceSignature: signature,
            isLoaded: false,
            error: null,
          },
        },
      });
      updates.push({ nodeId: node.id, action: "apply", signature });
    } else if (currentSignature.startsWith(PANORAMA_EDGE_SIGNATURE_PREFIX)) {
      storeInstance.updateNodeData(node.id, {
        sceneNode: {
          ...sceneState,
          panorama: {
            localPath: null,
            imageUrl: null,
            fileName: null,
            sourceSignature: null,
            isLoaded: false,
            error: null,
          },
        },
      });
      updates.push({ nodeId: node.id, action: "clear" });
    }
  }
  return updates;
}
