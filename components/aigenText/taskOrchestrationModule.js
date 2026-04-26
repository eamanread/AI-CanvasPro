import { createAIGenTextNodeTaskOrchestrationModule as createLegacyTaskOrchestrationModule } from "./taskOrchestrationModule.legacy.js";
import {
  applyTextNodeSelectionPatch,
  buildRegistryTextPayload,
  generateTextWithRegistryModel,
  REGISTRY_TEXT_PROVIDER,
  resolveTextNodeModelState,
} from "./modelRegistryRuntime.js";

const GENERATING_ICON_HTML =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';

function trimText(value) {
  return String(value ?? "").trim();
}

function showToast(message, level = "error") {
  window.showToast?.(message, level);
}

function setGeneratingState(node, isGenerating) {
  node._isGenerating = isGenerating;
  if (!node.btnEl) {
    return;
  }

  node.btnEl.disabled = isGenerating;
  node.btnEl.innerHTML = isGenerating ? GENERATING_ICON_HTML : "生成";
  if (!isGenerating && typeof node._updateSubmitButtonState === "function") {
    node._updateSubmitButtonState();
  }
}

function updateOutputDom(node, outputText) {
  if (!node.outputEl) {
    return;
  }

  node.outputEl.textContent = outputText;
  node.outputEl.style.display = "block";
  if (node._placeholderEl) {
    node._placeholderEl.style.display = "none";
  }
}

function createWrappedModule(legacyModule, overrides) {
  const wrappedModule = {};
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(legacyModule));
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(overrides));
  return wrappedModule;
}

export function createAIGenTextNodeTaskOrchestrationModule(deps) {
  const legacyModule = createLegacyTaskOrchestrationModule(deps);
  const originalBuildPayload = legacyModule._buildPayload;

  return createWrappedModule(legacyModule, {
    async _buildPayload(userInput = null) {
      const runtimeState = resolveTextNodeModelState(this._data);
      applyTextNodeSelectionPatch(this, deps.store, runtimeState.patch);

      if (runtimeState.state === "deleted") {
        showToast("模型已删除，请重新选择");
        return null;
      }

      if (runtimeState.state === "unconfigured" || !runtimeState.model) {
        showToast("该模型未配置", "warn");
        return null;
      }

      const originalData = this._data;
      const safeData = {
        ...originalData,
        model: runtimeState.model.modelId || runtimeState.model.modelName || "gpt-4o-mini",
        provider: "openai",
      };

      let basePayload = null;
      try {
        this._data = safeData;
        basePayload = await originalBuildPayload.call(this, userInput);
      } finally {
        this._data = originalData;
      }

      if (!basePayload) {
        return null;
      }

      return buildRegistryTextPayload(basePayload, runtimeState.model);
    },

    async _onGenerate(userInput = null) {
      if (this._isGenerating) {
        return;
      }

      const payload = await this._buildPayload(userInput);
      if (!payload) {
        return;
      }

      if (
        payload.provider !== REGISTRY_TEXT_PROVIDER ||
        !trimText(payload.apiUrl) ||
        !trimText(payload.apiKey)
      ) {
        return legacyModule._onGenerate.call(this, userInput);
      }

      setGeneratingState(this, true);
      deps.startLoading(this.previewEl);

      const generationStartTime = Date.now();
      deps.store.updateNodeData(this.nodeId, {
        generationStartTime,
        generationDuration: null,
      });

      try {
        const result = await generateTextWithRegistryModel(payload);
        const outputText = trimText(result?.text);
        if (outputText) {
          deps.store.updateNodeData(this.nodeId, {
            outputText,
            generationDuration: Date.now() - generationStartTime,
          });
          updateOutputDom(this, outputText);
        }
      } catch (error) {
        showToast(`文本生成失败: ${error?.message || error}`);
        deps.store.updateNodeData(this.nodeId, {
          generationDuration: Date.now() - generationStartTime,
        });
      } finally {
        setGeneratingState(this, false);
        deps.stopLoading(this.previewEl);
      }
    },
  });
}
