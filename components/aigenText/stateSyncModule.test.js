import test from "node:test";
import assert from "node:assert/strict";

import { createAIGenTextNodeStateSyncModule } from "./stateSyncModule.js";

function createDeps() {
  return {
    store: {
      getState() {
        return {
          pickConnectMode: {},
          nodes: {},
          selectedNodeIds: [],
        };
      },
      getIncomingEdges() {
        return [];
      },
      updateNodeData() {},
    },
    api: {},
    getDisplayModelName(value) {
      return value;
    },
    ensureThumbDecoded() {},
    revealRefThumbMedia() {},
    commit() {},
    TEXT_TOOLBAR_HTML: "",
    bindTextToolbarEvents() {},
    getPromptPresets() {
      return [];
    },
    openCustomPresetsManager() {},
    startLoading() {},
    stopLoading() {},
    bindRefThumbHoverPreview() {},
    checkSlashTrigger() {},
    handleSlashKeyboardNavigation() {},
    closeSlashMenu() {},
    activateMenuKeyboard() {},
    _checkAtTrigger() {},
    _populateMentionMenu() {},
    _handleMentionMenuKeyboard() {},
    _handlePillKeyboard() {},
    _rehydratePromptPills() {},
    _handlePillHover() {},
    _handlePillOut() {},
    _syncEdgesOrderFromPills() {},
    _syncPillLabels() {},
    getCustomTextModels() {
      return [];
    },
    saveCustomTextModels() {},
  };
}

test("aigenText state sync: registry wrapper 保留 legacy prototype 方法", () => {
  const moduleProto = createAIGenTextNodeStateSyncModule(createDeps());

  assert.equal(typeof moduleProto.update, "function");
  assert.equal(typeof moduleProto._renderRefBar, "function");
  assert.equal(typeof moduleProto._syncBtnIconState, "function");
  assert.equal(typeof moduleProto._bindDragSort, "function");
});
