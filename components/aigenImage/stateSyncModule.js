import {
  createAIGenerateNodeStateSyncModule as createLegacyStateSyncModule,
  resolveRefImageCandidateUrls,
} from "./stateSyncModule.legacy.js";
import {
  applyImageModelSelectorUi,
  applyImageNodeSelectionPatch,
  isRegistryImageNodeData,
  normalizeImageNodeData,
} from "./modelRegistryRuntime.js";

export { resolveRefImageCandidateUrls };

function createWrappedModule(legacyModule, overrides) {
  const wrappedModule = {};
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(legacyModule));
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(overrides));
  return wrappedModule;
}

export function createAIGenerateNodeStateSyncModule(deps) {
  const legacyModule = createLegacyStateSyncModule(deps);
  const originalUpdate = legacyModule.update;

  return createWrappedModule(legacyModule, {
    update(data) {
      if (!isRegistryImageNodeData(data)) {
        return originalUpdate.call(this, data);
      }

      const normalized = normalizeImageNodeData(data);
      applyImageNodeSelectionPatch(this, deps.store, normalized.patch);
      const result = originalUpdate.call(this, normalized.data);
      applyImageModelSelectorUi({
        node: this,
        data: normalized.data,
        store: deps.store,
      });
      return result;
    },
  });
}
