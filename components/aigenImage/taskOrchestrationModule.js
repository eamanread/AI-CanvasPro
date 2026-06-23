import { createAIGenerateNodeTaskOrchestrationModule as createLegacyTaskOrchestrationModule } from "./taskOrchestrationModule.impl.js";
import "../../modules/ImageFreeAngleController.registry.js";
import {
  PROMPT_PRESET_PILL_SELECTOR,
  getPromptTextWithPresetSelection,
} from "../../modules/promptPresetPillRuntime.js";
import {
  applyImageNodeSelectionPatch,
  buildRegistryImagePayload,
  generateImageWithRegistryModel,
  isRegistryImageNodeData,
  REGISTRY_IMAGE_PROVIDER,
  resolveImageNodeModelState,
} from "./modelRegistryRuntime.js";
import {
  buildPersistentGenerationFailurePatch,
  buildPersistentGenerationStartPatch,
  buildPersistentGenerationSuccessPatch,
  persistGenerationFailure,
} from "../../src/core/persistentGenerationError.js";
import {
  applyGenerationSubmitButtonState,
  beginGenerationRun,
  isGenerationAbortError,
} from "../../src/core/generationRunController.js";

function trimText(value) {
  return String(value ?? "").trim();
}

function hasMatchingPromptPresetSelection(node) {
  const selection = node?._data?.promptPresetSelection;
  const title = trimText(selection?.title);
  const pill = node?.promptEl?.querySelector?.(PROMPT_PRESET_PILL_SELECTOR);
  if (!title || !pill) {
    return false;
  }
  const pillTitle = trimText(pill.getAttribute?.("data-prompt-preset-title") || pill.textContent);
  return pillTitle === title;
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

  applyGenerationSubmitButtonState(node, isGenerating ? "running" : "idle");
}

function applyImageStopButtonState(node) {
  if (!node?.btnEl || node?._isGenerating !== true) {
    return;
  }

  applyGenerationSubmitButtonState(node, "running");
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
    jobError: null,
    error: null,
    generationDuration: Date.now() - startedAt,
    asyncTaskStatus: "success",
  };
}

function syncNodeDataFromStore(node, store) {
  const latestNodeData = store?.getState?.()?.nodes?.[node?.nodeId];
  if (!latestNodeData || latestNodeData === node?._data) {
    return;
  }

  node._data = latestNodeData;
}

function submitGenerationFromAgent(node, prompt = "", task = {}) {
  if (node?._isGenerating) {
    return {
      started: true,
      alreadyRunning: true,
      nodeId: trimText(node.nodeId || node._data?.id || task.nodeId),
      source: "assistant",
    };
  }

  const run = node?._onGenerate;
  if (typeof run !== "function") {
    return {
      started: false,
      retryable: true,
      nodeId: trimText(node?.nodeId || node?._data?.id || task.nodeId),
      source: "assistant",
      warning: "node generation method unavailable",
    };
  }

  Promise.resolve(run.call(node, prompt)).catch(() => {});
  return {
    started: true,
    nodeId: trimText(node.nodeId || node._data?.id || task.nodeId),
    nodeType: trimText(task.nodeType || node._data?.type),
    source: "assistant",
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
  const originalUpdateSubmitButtonState = legacyModule._updateSubmitButtonState;
  const originalHandleGenerateOrCancel = legacyModule._handleGenerateOrCancel;
  const originalCancelRunningHubTask = legacyModule._cancelRunningHubTask;

  return createWrappedModule(legacyModule, {
    submitGenerationFromAgent(prompt = "", task = {}) {
      return submitGenerationFromAgent(this, prompt, task);
    },

    _updateSubmitButtonState(...args) {
      const result = originalUpdateSubmitButtonState?.apply(this, args);
      applyImageStopButtonState(this);
      return result;
    },

    async _handleGenerateOrCancel(...args) {
      if (this._isGenerating) {
        if (this._generationRun && typeof this._generationRun.cancelNow === "function") {
          this._generationRun.cancelNow();
        } else {
          this._rhCancelRequested = true;
          this._rhAbortController?.abort?.();
          setGeneratingState(this, false);
          deps.store?.updateNodeData?.(this.nodeId, {
            isGenerating: false,
            jobStatus: null,
            asyncTaskStatus: "cancelled",
          });
          deps.stopLoading?.(this.previewEl);
          if (typeof originalCancelRunningHubTask === "function") {
            Promise.resolve()
              .then(() => originalCancelRunningHubTask.apply(this, args))
              .catch(() => {});
          }
        }
        return;
      }
      const result = originalHandleGenerateOrCancel?.apply(this, args);
      applyImageStopButtonState(this);
      return await result;
    },

    async _cancelRunningHubTask(...args) {
      const result = originalCancelRunningHubTask?.apply(this, args);
      applyImageStopButtonState(this);
      return await result;
    },

    async _buildPayload(userInput = null) {
      syncNodeDataFromStore(this, deps.store);
      const resolvedUserInput = hasMatchingPromptPresetSelection(this)
        ? getPromptTextWithPresetSelection({
            promptEl: this.promptEl,
            nodeData: this._data,
            fallbackText: userInput ?? this.promptEl?.textContent ?? "",
          })
        : userInput;

      if (!isRegistryImageNodeData(this._data)) {
        return originalBuildPayload.call(this, resolvedUserInput);
      }

      const runtimeState = resolveImageNodeModelState(this._data);
      applyImageNodeSelectionPatch(this, deps.store, runtimeState.patch);

      if (runtimeState.state === "deleted") {
        const message = "模型已删除，请重新选择";
        showToast(message);
        persistGenerationFailure(deps.store, this.nodeId, message, {
          asyncTaskStatus: "failed",
        });
        return null;
      }

      if (runtimeState.state === "unconfigured" || !runtimeState.model) {
        const message = "该模型未配置";
        showToast(message, "warn");
        persistGenerationFailure(deps.store, this.nodeId, message, {
          asyncTaskStatus: "failed",
        });
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
        basePayload = await originalBuildPayload.call(this, resolvedUserInput);
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
        const result = legacyModule._onGenerate.call(this, userInput);
        applyImageStopButtonState(this);
        return await result;
      }

      if (this._isGenerating) {
        if (this._generationRun && typeof this._generationRun.cancelNow === "function") {
          this._generationRun.cancelNow();
        }
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
      const run = beginGenerationRun(this, {
        store: deps.store,
        nodeId: this.nodeId,
        previewEl: this.previewEl,
        startLoading: deps.startLoading,
        stopLoading: deps.stopLoading,
        startedAt: generationStartTime,
      });
      deps.store.updateNodeData(this.nodeId, {
        ...buildPersistentGenerationStartPatch(),
        isGenerating: true,
        jobStatus: "generating",
        error: null,
        generationStartTime,
        generationDuration: null,
        asyncTaskStatus: "running",
      });

      try {
        const result = await generateImageWithRegistryModel(payload, {
          signal: run.signal,
          onTaskMeta: ({ taskId, apiKey }) => run.setTaskMeta({ taskId, apiKey }),
          onTaskId: (taskId) => run.setTaskMeta({ taskId }),
        });
        if (!run.isCurrent() || run.cancelled) {
          return;
        }
        deps.store.updateNodeData(
          this.nodeId,
          {
            ...buildPersistentGenerationSuccessPatch(),
            ...buildRegistrySuccessPatch(result, generationStartTime),
          }
        );
      } catch (error) {
        if (run.cancelled || isGenerationAbortError(error)) {
          if (run.isCurrent()) {
            deps.store.updateNodeData(this.nodeId, {
              isGenerating: false,
              jobStatus: null,
              generationDuration: Date.now() - generationStartTime,
              asyncTaskStatus: "cancelled",
            });
          }
          return;
        }
        if (!run.isCurrent()) {
          return;
        }
        const message = normalizeRegistryGenerationErrorMessage(error?.message || error);
        showToast(`图片生成失败: ${message}`);
        deps.store.updateNodeData(this.nodeId, {
          ...buildPersistentGenerationFailurePatch(message),
          isGenerating: false,
          jobStatus: "error",
          error: message,
          generationDuration: Date.now() - generationStartTime,
          asyncTaskStatus: "failed",
        });
      } finally {
        if (run.isCurrent()) {
          setGeneratingState(this, false);
          deps.stopLoading?.(this.previewEl);
          run.finish();
        }
      }
    },
  });
}
