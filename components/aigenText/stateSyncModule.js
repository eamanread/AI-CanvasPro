import { createAIGenTextNodeStateSyncModule as createLegacyStateSyncModule } from "./stateSyncModule.legacy.js";
import {
  applyTextModelSelectorUi,
  applyTextNodeSelectionPatch,
  normalizeTextNodeData,
} from "./modelRegistryRuntime.js";

export function createAIGenTextNodeStateSyncModule(deps) {
  const legacyModule = createLegacyStateSyncModule(deps);
  const originalUpdate = legacyModule.update;

  const wrappedModule = {};
  Object.defineProperties(
    wrappedModule,
    Object.getOwnPropertyDescriptors(legacyModule)
  );
  Object.defineProperties(wrappedModule, {
    update: {
      value(data) {
        const normalized = normalizeTextNodeData(data);
        applyTextNodeSelectionPatch(this, deps.store, normalized.patch);
        const result = originalUpdate.call(this, normalized.data);
        applyTextModelSelectorUi({
          node: this,
          data: normalized.data,
          store: deps.store,
        });
        return result;
      },
    },
  });

  return wrappedModule;
}
