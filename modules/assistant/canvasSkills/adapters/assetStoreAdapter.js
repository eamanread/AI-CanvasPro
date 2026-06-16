import { createAssistantCanvasAssetSkills } from "../../assistantCanvasAssetSkills.js";

function collection(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Map || value instanceof Set) return Array.from(value.values());
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function stateOf(store) {
  return typeof store?.getState === "function" ? store.getState() : store || {};
}

export function createAssetStoreAdapter({ assetStore = null, graphStore = null, workspaceStore = null, windowRef = globalThis.window } = {}) {
  const manager = assetStore || windowRef?.assetManager || windowRef?.__huanyingAssetManager || null;
  return {
    getState() {
      const managerAssets = manager?.getState?.()?.assets || manager?.assets || manager?._assets;
      return { assets: collection(managerAssets || stateOf(graphStore).assets || stateOf(workspaceStore).assets) };
    },
    addAsset(asset) {
      if (typeof manager?.addAsset === "function") return manager.addAsset(asset);
      if (typeof manager?._upsertLocalAsset === "function") {
        const saved = manager._upsertLocalAsset(asset);
        manager.renderSidebarContent?.();
        return saved;
      }
      if (Array.isArray(manager?.assets)) {
        manager.assets.unshift(asset);
        manager.renderSidebarContent?.();
        return asset;
      }
      return asset;
    },
  };
}

export function createAssetSkillsAdapter(options = {}) {
  return createAssistantCanvasAssetSkills({
    ...options,
    assetStore: options.assetStore?.getState ? options.assetStore : createAssetStoreAdapter(options),
  });
}
