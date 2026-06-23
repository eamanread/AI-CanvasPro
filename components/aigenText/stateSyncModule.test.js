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

test("aigenText state sync: 持久错误写入输出区域并隐藏占位", () => {
  const originalDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
  };
  const moduleProto = createAIGenTextNodeStateSyncModule(createDeps());
  const elementStub = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    style: {},
  };
  const node = {
    nodeId: "text-error-node",
    _data: {},
    el: elementStub,
    rootEl: elementStub,
    cardEl: elementStub,
    previewEl: elementStub,
    _root: elementStub,
    root: elementStub,
    outputEl: {
      textContent: "",
      style: {},
    },
    _placeholderEl: {
      style: {
        display: "block",
      },
      querySelector: elementStub.querySelector,
    },
    _renderRefBar() {},
    _syncBtnIconState() {},
    _bindDragSort() {},
    _rehydratePromptPills() {},
    _syncPillLabels() {},
    _renderModelSelector() {},
    _applyModelSelectorUi() {},
    _renderOutput() {},
    _setOutputText() {},
    _updateOutputVisibility() {},
    querySelector: elementStub.querySelector,
    querySelectorAll: elementStub.querySelectorAll,
  };

  try {
    moduleProto.update.call(node, {
      id: "text-error-node",
      type: "custom-ai-text",
      jobError: "模型未配置 API Key",
    });

    assert.equal(node.outputEl.textContent, "模型未配置 API Key");
    assert.equal(node.outputEl.style.display, "block");
    assert.equal(node.outputEl.style.color, "var(--red)");
    assert.equal(node.outputEl.style.whiteSpace, "pre-wrap");
    assert.equal(node.outputEl.style.overflowWrap, "anywhere");
    assert.equal(node._placeholderEl.style.display, "none");
  } finally {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
});
