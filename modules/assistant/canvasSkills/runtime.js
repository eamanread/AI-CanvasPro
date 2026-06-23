import { createCanvasSkillExecutor } from "./executor.js";
import { createAssetSkillsAdapter } from "./adapters/assetStoreAdapter.js";
import { createModelRegistryAdapter } from "./adapters/modelRegistryAdapter.js";
import { createNodeLifecycleAdapter } from "./adapters/nodeLifecycleAdapter.js";
import { createPromptPresetAdapter } from "./adapters/promptPresetAdapter.js";
import { resolveRendererBridge } from "./adapters/rendererBridgeAdapter.js";
import { createWorkflowAdapter } from "./adapters/workflowAdapter.js";
import { createGenerationTaskBridge } from "./generationTaskBridge.js";

function nodePrompt(node) {
  return String(node?.prompt || node?.data?.prompt || node?.template || node?.data?.template || "").trim();
}

export function createCanvasSkillsRuntime({
  executeActions = null,
  graphStore = null,
  workspaceStore = null,
  adapters = {},
  nodeFlows = null,
  rendererBridge = null,
  rendererBridgeResolver = null,
  workflowService = {},
  workflowCanvas = {},
  assetStore = null,
  saveAssetToServer = null,
  saveAsset = null,
  applyPromptPresetToPromptEl = null,
  windowRef = globalThis.window,
  pollIntervalMs = 25,
  readinessTimeoutMs = 2000,
} = {}) {
  if (typeof executeActions === "function") {
    return { executeActions };
  }

  const currentRendererBridge =
    typeof adapters.rendererBridgeResolver === "function"
      ? adapters.rendererBridgeResolver
      : typeof rendererBridgeResolver === "function"
        ? rendererBridgeResolver
        : () =>
            resolveRendererBridge({
              rendererBridge: adapters.rendererBridge || rendererBridge,
              windowRef,
            });
  const resolvedRendererBridge = currentRendererBridge();
  const resolvedNodeFlows =
    adapters.nodeFlows ||
    nodeFlows ||
    windowRef?.appCanvasNodeFlows ||
    windowRef?.__huanyingCanvasNodeFlows ||
    null;
  const generationTaskBridge =
    adapters.generationTaskBridge ||
    createGenerationTaskBridge({
      graphStore,
      rendererBridge: resolvedRendererBridge,
      rendererBridgeResolver: currentRendererBridge,
      windowRef,
      pollIntervalMs,
      readinessTimeoutMs,
    });
  const nodeLifecycle =
    adapters.nodeLifecycle ||
    createNodeLifecycleAdapter({
      graphStore,
      nodeFlows: resolvedNodeFlows,
      rendererBridge: resolvedRendererBridge,
      rendererBridgeResolver: currentRendererBridge,
      windowRef,
      generationTaskBridge,
      pollIntervalMs,
      readinessTimeoutMs,
    });
  const workflowSkills =
    adapters.workflowSkills ||
    createWorkflowAdapter({
      graphStore,
      workflowService: adapters.workflowService || workflowService,
      workflowCanvas: adapters.workflowCanvas || workflowCanvas,
    });
  const assetSkills =
    adapters.assetSkills ||
    createAssetSkillsAdapter({
      graphStore,
      workspaceStore,
      assetStore: adapters.assetStore || assetStore,
      saveAssetToServer: adapters.saveAssetToServer || saveAssetToServer || saveAsset,
      windowRef,
    });
  const promptPresetAdapter =
    adapters.promptPresetAdapter ||
    createPromptPresetAdapter({
      rendererBridge: resolvedRendererBridge,
      rendererBridgeResolver: currentRendererBridge,
      windowRef,
      applyPromptPresetToPromptEl,
    });

  return createCanvasSkillExecutor({
    graphStore,
    nodeLifecycle,
    workflowSkills,
    assetSkills,
    promptPresetAdapter,
    modelRegistry: createModelRegistryAdapter(adapters.modelRegistry),
  });
}
