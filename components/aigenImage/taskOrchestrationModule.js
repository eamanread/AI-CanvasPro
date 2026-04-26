import { createAIGenerateNodeTaskOrchestrationModule as createLegacyTaskOrchestrationModule } from "./taskOrchestrationModule.impl.js";
import {
  applyImageNodeSelectionPatch,
  buildRegistryImagePayload,
  generateImageWithRegistryModel,
  isRegistryImageNodeData,
  REGISTRY_IMAGE_PROVIDER,
  resolveImageNodeModelState,
} from "./modelRegistryRuntime.js";

function trimText(value) {
  return String(value ?? "").trim();
}

function showToast(message, level = "error") {
  window.showToast?.(message, level);
}

const REMOTE_RESULT_URL_EXPIRED_RE = /resource\s+is\s+valid\s+for\s+\d+\s*hours?/i;

function normalizeRegistryGenerationErrorMessage(value) {
  const message = trimText(value);
  if (!message) {
    return "图片生成失败";
  }
  if (REMOTE_RESULT_URL_EXPIRED_RE.test(message)) {
    return "结果图片临时链接已过期，请重新生成";
  }
  return message;
}

function setGeneratingState(node, isGenerating) {
  node._isGenerating = isGenerating;
  if (!node.btnEl) {
    return;
  }

  node.btnEl.disabled = isGenerating;
  node.btnEl.textContent = isGenerating ? "生成中" : "生成";
  if (!isGenerating && typeof node._updateSubmitButtonState === "function") {
    node._updateSubmitButtonState();
  }
}

function normalizeImages(result) {
  if (Array.isArray(result?.images)) {
    return result.images.filter(Boolean);
  }
  if (result && typeof result === "object") {
    return [result];
  }
  return [];
}

function buildRegistrySuccessPatch(result, startedAt) {
  const images = normalizeImages(result);
  const firstImage = images[0] || {};

  return {
    images,
    mainImageIndex: 0,
    sourceUrl: trimText(firstImage.sourceUrl),
    thumbUrl: trimText(firstImage.thumbUrl || firstImage.imageUrl || firstImage.sourceUrl),
    imageUrl: trimText(firstImage.imageUrl || firstImage.thumbUrl || firstImage.sourceUrl),
    localPath: trimText(firstImage.localPath),
    originalLocalPath: trimText(firstImage.originalLocalPath),
    displayLocalPath: trimText(firstImage.displayLocalPath),
    thumbLocalPath: trimText(firstImage.thumbLocalPath),
    isGenerating: false,
    jobStatus: "success",
    error: null,
    generationDuration: Date.now() - startedAt,
    asyncTaskStatus: "success",
  };
}

function createWrappedModule(legacyModule, overrides) {
  const wrappedModule = {};
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(legacyModule));
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(overrides));
  return wrappedModule;
}

export function createAIGenerateNodeTaskOrchestrationModule(deps) {
  const legacyModule = createLegacyTaskOrchestrationModule(deps);
  const originalBuildPayload = legacyModule._buildPayload;

  return createWrappedModule(legacyModule, {
    async _buildPayload(userInput = null) {
      if (!isRegistryImageNodeData(this._data)) {
        return originalBuildPayload.call(this, userInput);
      }

      const runtimeState = resolveImageNodeModelState(this._data);
      applyImageNodeSelectionPatch(this, deps.store, runtimeState.patch);

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
        model: runtimeState.model.modelId || runtimeState.model.modelName || "nano-banana-2",
        provider: "grsai",
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

      return buildRegistryImagePayload(basePayload, runtimeState.model);
    },

    async _onGenerate(userInput = null) {
      if (!isRegistryImageNodeData(this._data)) {
        return legacyModule._onGenerate.call(this, userInput);
      }

      if (this._isGenerating) {
        return;
      }

      const payload = await this._buildPayload(userInput);
      if (!payload) {
        return;
      }

      if (
        payload.provider !== REGISTRY_IMAGE_PROVIDER ||
        !trimText(payload.apiUrl) ||
        !trimText(payload.apiKey)
      ) {
        return legacyModule._onGenerate.call(this, userInput);
      }

      const generationStartTime = Date.now();
      setGeneratingState(this, true);
      deps.startLoading?.(this.previewEl);
      deps.store.updateNodeData(this.nodeId, {
        isGenerating: true,
        jobStatus: "generating",
        error: null,
        generationStartTime,
        generationDuration: null,
        asyncTaskStatus: "running",
      });

      try {
        const result = await generateImageWithRegistryModel(payload);
        deps.store.updateNodeData(
          this.nodeId,
          buildRegistrySuccessPatch(result, generationStartTime)
        );
      } catch (error) {
        const message = normalizeRegistryGenerationErrorMessage(error?.message || error);
        showToast(`图片生成失败: ${message}`);
        deps.store.updateNodeData(this.nodeId, {
          isGenerating: false,
          jobStatus: "error",
          error: message,
          generationDuration: Date.now() - generationStartTime,
          asyncTaskStatus: "failed",
        });
      } finally {
        setGeneratingState(this, false);
        deps.stopLoading?.(this.previewEl);
      }
    },
  });
}
