import { createAIGenTextNodeStateSyncModule as createLegacyStateSyncModule } from "./stateSyncModule.legacy.js";
import {
  applyTextModelSelectorUi,
  applyTextNodeSelectionPatch,
  normalizeTextNodeData,
} from "./modelRegistryRuntime.js";

function trimText(value) {
  return String(value ?? "").trim();
}

function renderPersistentTextError(node, data) {
  const message = trimText(data?.jobError || data?.error);
  if (!message || !node?.outputEl) {
    return;
  }

  node.outputEl.textContent = message;
  node.outputEl.style.display = "block";
  node.outputEl.style.color = "var(--red)";
  node.outputEl.style.whiteSpace = "pre-wrap";
  node.outputEl.style.overflowWrap = "anywhere";
  if (node._placeholderEl) {
    node._placeholderEl.style.display = "none";
  }
}

function clearPersistentTextErrorStyle(node, data) {
  if (!node?.outputEl || trimText(data?.jobError || data?.error)) {
    return;
  }
  node.outputEl.style.color = "";
}

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
        renderPersistentTextError(this, normalized.data);
        clearPersistentTextErrorStyle(this, normalized.data);
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
