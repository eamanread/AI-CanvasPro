import { listAssetCategories, normalizeAssetRecord } from "./canvasSkills/assets/assetCatalog.js";
import { searchAssets } from "./canvasSkills/assets/assetSearchIndex.js";
import { checkAssetReferenceHealth } from "./canvasSkills/assets/assetReferenceHealth.js";

function text(value) {
  return String(value ?? "").trim();
}

function stateOf(store) {
  return typeof store?.getState === "function" ? store.getState() : store || {};
}

function collection(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Map || value instanceof Set) return Array.from(value.values());
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function graphNodes(graphStore) {
  return collection(stateOf(graphStore).nodes || graphStore?.nodes);
}

function nodeById(graphStore, nodeId) {
  return graphNodes(graphStore).find((node) => text(node?.id) === text(nodeId));
}

function assetsFromStore(assetStore, graphStore) {
  const state = stateOf(assetStore);
  const graphState = stateOf(graphStore);
  return collection(state.assets || assetStore?.assets || graphState.assets);
}

function firstMedia(node) {
  const data = node?.data && typeof node.data === "object" ? node.data : node || {};
  const images = Array.isArray(data.images) ? data.images : [];
  const videos = Array.isArray(data.videos) ? data.videos : [];
  return images[0] || videos[0] || data.imageUrl || data.videoUrl || data.localPath || data.url || "";
}

export function createAssistantCanvasAssetSkills({ graphStore, assetStore = {}, saveAssetToServer = null } = {}) {
  async function listAssets(action = {}) {
    const allAssets = assetsFromStore(assetStore, graphStore).map(normalizeAssetRecord);
    const assets = searchAssets(allAssets, {
      query: action.query,
      category: action.category || action.assetType,
      sourceNodeId: action.sourceNodeId,
    });
    const referenceHealth = action.includeHealth
      ? checkAssetReferenceHealth({ assets: allAssets, nodes: graphNodes(graphStore) })
      : { ok: true, warnings: [] };
    return { assets, categories: listAssetCategories(), referenceHealth };
  }

  async function useAsset(action = {}) {
    const assetId = text(action.assetId || action.id);
    const asset = assetsFromStore(assetStore, graphStore).map(normalizeAssetRecord).find((item) => text(item?.id) === assetId);
    if (!asset) return { used: false, warning: `asset not found: ${assetId || "unknown"}` };
    return { used: true, asset };
  }

  async function addAsset(action = {}) {
    if (action.explicitIntent !== true) {
      return { saved: false, warning: "explicit asset save intent required" };
    }
    if (typeof saveAssetToServer !== "function") {
      return { saved: false, warning: "asset persistence service unavailable" };
    }
    const sourceNodeId = text(action.sourceNodeId || action.nodeId || action.targetNodeId);
    const node = sourceNodeId ? nodeById(graphStore, sourceNodeId) : null;
    const payload = normalizeAssetRecord({
      id: action.assetId,
      name: action.name || action.title || node?.name || "Agent asset",
      assetType: action.assetType || action.category || action.type || "asset",
      category: action.assetType || action.category || action.type || "asset",
      tags: Array.isArray(action.tags) ? action.tags : [],
      sourceNodeId,
      resultId: action.resultId,
      media: firstMedia(node),
      url: firstMedia(node),
      nodeData: node ? { ...(node.data || {}), id: node.id, type: node.type || node.nodeType } : undefined,
    });
    const saved = await saveAssetToServer(payload);
    if (!saved || !text(saved.id)) {
      return { saved: false, warning: "asset persistence returned no id" };
    }
    const normalized = normalizeAssetRecord(saved);
    assetStore?.addAsset?.(normalized);
    return { saved: true, assetId: text(normalized.id), asset: normalized };
  }

  return { listAssets, useAsset, addAsset };
}
