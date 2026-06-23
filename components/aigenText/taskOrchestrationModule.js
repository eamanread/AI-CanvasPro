import { createAIGenTextNodeTaskOrchestrationModule as createLegacyTaskOrchestrationModule } from "./taskOrchestrationModule.legacy.js";
import {
  PROMPT_PRESET_PILL_SELECTOR,
  getPromptTextWithPresetSelection,
} from "../../modules/promptPresetPillRuntime.js";
import {
  applyTextNodeSelectionPatch,
  buildRegistryTextPayload,
  generateTextWithRegistryModel,
  REGISTRY_TEXT_PROVIDER,
  resolveTextNodeModelState,
} from "./modelRegistryRuntime.js";
import { cancelRunningHubTask, generateText } from "../../api/index.js";
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

function showToast(message, level = "error") {
  window.showToast?.(message, level);
}

function isAbortError(error) {
  return isGenerationAbortError(error);
}

function applyStopButtonState(node) {
  const btnEl = node?.btnEl;
  if (!btnEl || node?._isGenerating !== true) {
    return false;
  }

  return applyGenerationSubmitButtonState(node, "running");
}

function setGeneratingState(node, isGenerating) {
  node._isGenerating = isGenerating;
  if (!node.btnEl) {
    return;
  }

  if (typeof node._updateSubmitButtonState === "function") {
    node._updateSubmitButtonState();
    return;
  }

  applyGenerationSubmitButtonState(node, isGenerating ? "running" : "idle");
  return;
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

export function createAIGenTextNodeTaskOrchestrationModule(deps) {
  const legacyModule = createLegacyTaskOrchestrationModule(deps);
  const originalBuildPayload = legacyModule._buildPayload;
  const originalUpdateSubmitButtonState = legacyModule._updateSubmitButtonState;

  return createWrappedModule(legacyModule, {
    submitGenerationFromAgent(prompt = "", task = {}) {
      return submitGenerationFromAgent(this, prompt, task);
    },

    _updateSubmitButtonState(...args) {
      if (applyStopButtonState(this)) {
        return;
      }

      const result = originalUpdateSubmitButtonState?.apply(this, args);
      if (this.btnEl) {
        this.btnEl.style.color = "";
        this.btnEl.removeAttribute?.("data-tooltip");
      }
      return result;
    },

    async _buildPayload(userInput = null) {
      const resolvedUserInput = hasMatchingPromptPresetSelection(this)
        ? getPromptTextWithPresetSelection({
            promptEl: this.promptEl,
            nodeData: this._data,
            fallbackText: userInput ?? this.promptEl?.textContent ?? "",
          })
        : userInput;
      const hasRegistrySelection =
        trimText(this._data?.selectedModelId) || trimText(this._data?.selectedModelNameSnapshot);
      if (!hasRegistrySelection) {
        return originalBuildPayload.call(this, resolvedUserInput);
      }

      const runtimeState = resolveTextNodeModelState(this._data);
      applyTextNodeSelectionPatch(this, deps.store, runtimeState.patch);

      if (runtimeState.state === "deleted") {
        const message = "模型已删除，请重新选择";
        persistGenerationFailure(deps.store, this.nodeId, message);
        showToast("模型已删除，请重新选择");
        return null;
      }

      if (runtimeState.state === "unconfigured" || !runtimeState.model) {
        const message = "该模型未配置";
        persistGenerationFailure(deps.store, this.nodeId, message);
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
        basePayload = await originalBuildPayload.call(this, resolvedUserInput);
      } finally {
        this._data = originalData;
      }

      if (!basePayload) {
        return null;
      }

      return buildRegistryTextPayload(basePayload, runtimeState.model);
    },

    async _cancelRunningHubTask() {
      if (this._rhCancelInFlight) {
        return;
      }

      this._rhCancelRequested = true;
      this._rhCancelInFlight = true;
      this._updateSubmitButtonState?.();

      const taskId = trimText(this._rhTaskId);
      const apiKey = trimText(this._rhApiKey);

      try {
        if (taskId && apiKey) {
          await cancelRunningHubTask({ apiKey, taskId });
        }
      } finally {
        this._rhAbortController?.abort();
      }
    },

    async _cancelActiveGeneration() {
      if (!this._isGenerating || this._rhCancelRequested || this._rhCancelInFlight) {
        return;
      }

      if (this._generationRun && typeof this._generationRun.cancelNow === "function") {
        this._generationRun.cancelNow();
        return;
      }

      this._rhCancelRequested = true;
      this._updateSubmitButtonState?.();

      if (trimText(this._rhTaskId) && trimText(this._rhApiKey)) {
        await this._cancelRunningHubTask();
        return;
      }

      this._rhAbortController?.abort();
    },

    async _onGenerate(userInput = null) {
      if (this._isGenerating) {
        await this._cancelActiveGeneration();
        return;
      }

      const payload = await this._buildPayload(userInput);
      if (!payload) {
        return;
      }

      const isRegistryModel =
        payload.provider === REGISTRY_TEXT_PROVIDER &&
        trimText(payload.apiUrl) &&
        trimText(payload.apiKey);

      const generationStartTime = Date.now();
      const run = beginGenerationRun(this, {
        store: deps.store,
        nodeId: this.nodeId,
        previewEl: this.previewEl,
        startLoading: deps.startLoading,
        stopLoading: deps.stopLoading,
        cancelRemote: ({ taskId, apiKey }) => cancelRunningHubTask({ apiKey, taskId }),
        startedAt: generationStartTime,
      });
      deps.store.updateNodeData(this.nodeId, {
        ...buildPersistentGenerationStartPatch(),
        isGenerating: true,
        jobStatus: "running",
        generationStartTime,
        generationDuration: null,
      });

      try {
        const result = isRegistryModel
          ? await generateTextWithRegistryModel(payload, {
              signal: run.signal,
            })
          : await generateText(payload, {
              signal: run.signal,
              onTaskMeta: ({ taskId, apiKey }) => {
                const nextTaskId = trimText(taskId);
                const nextApiKey = trimText(apiKey);
                run.setTaskMeta({ taskId: nextTaskId, apiKey: nextApiKey });
              },
              onTaskId: (taskId) => {
                const nextTaskId = trimText(taskId);
                if (!nextTaskId) {
                  return;
                }
                run.setTaskMeta({ taskId: nextTaskId });
              },
            });
        const outputText = trimText(result?.text);
        if (outputText && run.isCurrent() && !run.cancelled) {
          deps.store.updateNodeData(this.nodeId, {
            ...buildPersistentGenerationSuccessPatch(),
            isGenerating: false,
            jobStatus: "success",
            outputText,
            generationDuration: Date.now() - generationStartTime,
          });
          updateOutputDom(this, outputText);
        }
      } catch (error) {
        if (run.cancelled || isAbortError(error)) {
          if (run.isCurrent()) {
            deps.store.updateNodeData(this.nodeId, {
              isGenerating: false,
              jobStatus: null,
              generationDuration: Date.now() - generationStartTime,
            });
          }
          return;
        }

        if (!run.isCurrent()) {
          return;
        }

        const message = error?.message || error;
        showToast(`文本生成失败: ${error?.message || error}`);
        deps.store.updateNodeData(this.nodeId, {
          ...buildPersistentGenerationFailurePatch(message),
          isGenerating: false,
          jobStatus: "error",
          generationDuration: Date.now() - generationStartTime,
        });
      } finally {
        if (run.isCurrent()) {
          setGeneratingState(this, false);
          this._rhAbortController = null;
          this._rhTaskId = "";
          this._rhApiKey = "";
          this._rhCancelRequested = false;
          this._rhCancelInFlight = false;
          deps.stopLoading(this.previewEl);
          run.finish();
        }
      }
    },
  });
}
