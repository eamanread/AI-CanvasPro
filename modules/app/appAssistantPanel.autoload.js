import {
  createAppAssistantPanel,
  isLowRiskAssistantAction as sharedIsLowRiskAssistantAction,
} from "./appAssistantPanel.js";
import { createAssistantConversationStore } from "../assistant/assistantConversationStore.js";
import { createAssistantWorkflowTemplateStore } from "../assistant/assistantWorkflowTemplateStore.js";
import { buildAssistantModelRegistry } from "../assistant/assistantModelRegistry.js";
import { createCanvasAgentApi } from "../../api/canvasAgentApi.js";
import { fetchApiConfigFromServer, getApiConfigSnapshot } from "../../api/configApi.js";
import { buildAssistantCanvasContext } from "../assistant/assistantContextBuilder.js";
import { executeAssistantActions } from "../assistant/assistantActionExecutor.js";
import { applyPromptPresetToPromptEl } from "../slashMenu.js";
import { saveAssetToServer } from "../../api/index.js";
import { applyWorkflowToCanvas } from "../workflows/workflowCanvas.js";
import * as workflowService from "../workflows/workflowService.js";
import { graphStore as runtimeGraphStore, workspaceStore as runtimeWorkspaceStore } from "../../src/core/stores/appStore.js";
import { loadCanvasSkillsRuntime } from "../assistant/canvasSkills/loader.js";
import { createCanvasSkillsRuntime as createCanvasSkillsModuleRuntime } from "../assistant/canvasSkills/runtime.js";

function valuesFromStateCollection(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value instanceof Map || value instanceof Set) {
    return Array.from(value.values());
  }
  if (value && typeof value === "object") {
    return Object.values(value);
  }
  return [];
}

function readGraphState(graphStore) {
  if (graphStore && typeof graphStore.getState === "function") {
    const state = graphStore.getState();
    return state && typeof state === "object" ? state : {};
  }
  return graphStore && typeof graphStore === "object" ? graphStore : {};
}

function readWorkspaceState(workspaceStore) {
  if (workspaceStore && typeof workspaceStore.getState === "function") {
    const state = workspaceStore.getState();
    return state && typeof state === "object" ? state : {};
  }
  return workspaceStore && typeof workspaceStore === "object" ? workspaceStore : {};
}

function hasNodeCreationFlow(nodeFlows) {
  return typeof nodeFlows?.createNodeAtCursor === "function";
}

function projectIdFromWorkspaceStore(workspaceStore) {
  const state = readWorkspaceState(workspaceStore);
  return String(
    state.currentProjectId ||
      state.projectId ||
      state.currentProject?.id ||
      state.currentProject?.name ||
      globalThis.window?.currentProjectId ||
      "default-project"
  ).trim();
}

function teamIdFromWorkspaceStore(workspaceStore) {
  const state = readWorkspaceState(workspaceStore);
  return String(
    state.currentTeamId ||
      state.teamId ||
      state.workspaceTeamId ||
      state.currentWorkspace?.teamId ||
      globalThis.window?.currentTeamId ||
      ""
  ).trim();
}

export function createCanvasAgentGraphStoreAdapter(graphStore = runtimeGraphStore) {
  const adapter = {
    get nodes() {
      return valuesFromStateCollection(readGraphState(graphStore).nodes);
    },
    get edges() {
      return valuesFromStateCollection(readGraphState(graphStore).edges);
    },
    getState() {
      const state = readGraphState(graphStore);
      return {
        ...state,
        nodes: valuesFromStateCollection(state.nodes),
        edges: valuesFromStateCollection(state.edges),
      };
    },
    subscribe(callback) {
      if (typeof callback !== "function" || typeof graphStore?.subscribe !== "function") {
        return undefined;
      }
      return graphStore.subscribe(() => callback(adapter.getState()));
    },
    addNode(node = {}) {
      const payload = { ...(node.data || {}), ...node };
      delete payload.data;
      return graphStore?.addNode?.(payload);
    },
    addEdge(edge = {}) {
      const source = edge.source || edge.sourceId || edge.from;
      const target = edge.target || edge.targetId || edge.to;
      return graphStore?.addEdge?.({
        ...edge,
        source,
        target,
        sourceId: source,
        targetId: target,
      });
    },
    updateNodeData(nodeId, patch) {
      return graphStore?.updateNodeData?.(nodeId, patch);
    },
    updateNode(nodeId, patch) {
      if (typeof graphStore?.updateNode === "function") {
        return graphStore.updateNode(nodeId, patch);
      }
      if (patch && patch.name !== undefined && typeof graphStore?.renameNode === "function") {
        return graphStore.renameNode(nodeId, patch.name);
      }
      return undefined;
    },
    removeNode(nodeId) {
      if (typeof graphStore?.removeNode === "function") {
        return graphStore.removeNode(nodeId);
      }
      if (typeof graphStore?.deleteNodes === "function") {
        return graphStore.deleteNodes([nodeId]);
      }
      return undefined;
    },
    removeEdge(edgeId) {
      return graphStore?.removeEdge?.(edgeId);
    },
    setSelectedNodes(nodeIds) {
      return graphStore?.setSelectedNodes?.(nodeIds);
    },
  };
  return adapter;
}

export function isLowRiskAssistantAction(action = {}) {
  return sharedIsLowRiskAssistantAction(action);
}

export function createCanvasAgentTemplateStore({
  storage = globalThis.window?.localStorage || globalThis.localStorage,
  workspaceStore = runtimeWorkspaceStore,
  projectId = "",
  teamId = "",
} = {}) {
  return createAssistantWorkflowTemplateStore({
    storage,
    projectId: String(projectId || projectIdFromWorkspaceStore(workspaceStore) || "default-project"),
    teamId: String(teamId || teamIdFromWorkspaceStore(workspaceStore) || ""),
  });
}

function resolveCanvasNodeFlows({ nodeFlows = null, windowRef = globalThis.window } = {}) {
  return nodeFlows || windowRef?.appCanvasNodeFlows || windowRef?.__huanyingCanvasNodeFlows || null;
}

function resolveRendererBridge({ rendererBridge = null, windowRef = globalThis.window } = {}) {
  return (
    rendererBridge ||
    windowRef?.__v2RendererBridge ||
    windowRef?.v2Renderer ||
    globalThis.__v2RendererBridge ||
    globalThis.v2Renderer ||
    null
  );
}

function createCanvasAgentAssetStoreAdapter({
  assetStore = null,
  graphStore = null,
  workspaceStore = null,
  windowRef = globalThis.window,
} = {}) {
  const manager = assetStore || windowRef?.assetManager || windowRef?.__huanyingAssetManager || null;
  return {
    getState() {
      const managerAssets = manager?.getState?.()?.assets || manager?.assets || manager?._assets;
      const graphState = readGraphState(graphStore);
      const workspaceState = readWorkspaceState(workspaceStore);
      return {
        assets: valuesFromStateCollection(managerAssets || graphState.assets || workspaceState.assets),
      };
    },
    addAsset(asset) {
      if (typeof manager?.addAsset === "function") {
        return manager.addAsset(asset);
      }
      if (typeof manager?._upsertLocalAsset === "function") {
        const saved = manager._upsertLocalAsset(asset);
        manager.renderSidebarContent?.();
        return saved;
      }
      if (Array.isArray(manager?.assets)) {
        manager.assets.unshift(asset);
        manager.renderSidebarContent?.();
        return asset;
      }
      return asset;
    },
  };
}

export function createCanvasSkillsRuntime({
  graphStore,
  workspaceStore = runtimeWorkspaceStore,
  nodeFlows = null,
  rendererBridge = null,
  workflowService: workflowServiceAdapter = workflowService,
  workflowCanvas = { applyWorkflowToCanvas },
  assetStore = null,
  saveAsset = saveAssetToServer,
  windowRef = globalThis.window,
  readinessTimeoutMs = 8000,
  pollIntervalMs = 25,
} = {}) {
  const resolvedNodeFlows = resolveCanvasNodeFlows({ nodeFlows, windowRef });
  const rendererBridgeResolver = () => resolveRendererBridge({ rendererBridge, windowRef });
  return createCanvasSkillsModuleRuntime({
    graphStore,
    workspaceStore,
    adapters: {
      nodeFlows: resolvedNodeFlows,
      rendererBridge,
      rendererBridgeResolver,
      assetStore: createCanvasAgentAssetStoreAdapter({
        assetStore,
        graphStore,
        workspaceStore,
        windowRef,
      }),
      workflowService: workflowServiceAdapter,
      workflowCanvas,
      saveAssetToServer: saveAsset,
    },
    applyPromptPresetToPromptEl,
    rendererBridge,
    rendererBridgeResolver,
    windowRef,
    readinessTimeoutMs,
    pollIntervalMs,
  });
}

function readWindowLiveFixture(windowRef = globalThis.window) {
  if (windowRef?.__HUANYING_CANVAS_AGENT_ENABLE_LIVE_FIXTURE__ !== true) {
    return null;
  }
  const raw = windowRef?.__HUANYING_CANVAS_AGENT_LIVE_FIXTURE__;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const bootstrap = windowRef?.__HUANYING_CANVAS_AGENT_LIVE_BOOTSTRAP__;
  if (typeof bootstrap === "function") {
    const fixture = bootstrap(raw);
    return fixture && typeof fixture === "object" ? fixture : null;
  }
  return null;
}

function hasProviderConfig(config) {
  return Boolean(config?.providers && typeof config.providers === "object" && Object.keys(config.providers).length);
}

function buildModelState(apiConfig, liveFixture = null) {
  const modelRegistry = buildAssistantModelRegistry(apiConfig || {});
  const modelOptions = Array.isArray(liveFixture?.modelOptions)
    ? liveFixture.modelOptions
    : modelRegistry.options;
  const selectedModel =
    liveFixture?.selectedModel || modelRegistry.defaultModel || modelRegistry.defaultAgentModel();
  return {
    modelOptions,
    selectedModel,
    modelConfigRequired: !liveFixture,
  };
}

export function installAppAssistantPanel({
  document: documentRef = globalThis.document,
  api = createCanvasAgentApi(),
  graphStore = runtimeGraphStore,
  workspaceStore = runtimeWorkspaceStore,
  buildContext,
  conversationStore = createAssistantConversationStore(),
  apiConfig = getApiConfigSnapshot(),
  configLoader = fetchApiConfigFromServer,
  executeActions = executeAssistantActions,
  templateStore = null,
  canvasSkillsRuntime = null,
  autoInstall = true,
  liveFixture = null,
} = {}) {
  if (!documentRef?.body || typeof documentRef.createElement !== "function") {
    return null;
  }
  const resolvedLiveFixture = liveFixture || readWindowLiveFixture();
  const effectiveApi = resolvedLiveFixture?.api || api;
  const effectiveGraphStore = resolvedLiveFixture?.graphStore || graphStore;
  const graphAdapter = createCanvasAgentGraphStoreAdapter(effectiveGraphStore);
  const effectiveCanvasNodeFlows = resolveCanvasNodeFlows({
    nodeFlows: resolvedLiveFixture?.nodeFlows,
  });
  const effectiveCanvasSkillsRuntime =
    canvasSkillsRuntime ||
    resolvedLiveFixture?.canvasSkillsRuntime ||
    loadCanvasSkillsRuntime({
      adapters: {
        nodeLifecycle: hasNodeCreationFlow(effectiveCanvasNodeFlows) ? effectiveCanvasNodeFlows : null,
        rendererBridge: resolvedLiveFixture?.rendererBridge || null,
        rendererBridgeResolver: () => resolveRendererBridge({ rendererBridge: resolvedLiveFixture?.rendererBridge }),
      },
      executeActions: hasNodeCreationFlow(effectiveCanvasNodeFlows)
        ? createCanvasSkillsRuntime({
            graphStore: graphAdapter,
            workspaceStore,
            nodeFlows: effectiveCanvasNodeFlows,
            rendererBridge: resolvedLiveFixture?.rendererBridge,
            assetStore: resolvedLiveFixture?.assetStore,
          }).executeActions
        : null,
    });
  const contextBuilder =
    typeof buildContext === "function"
      ? buildContext
      : (options = {}) =>
          buildAssistantCanvasContext({
            graphStore: graphAdapter,
            workspaceStore,
            ...options,
          });
  const launcherElement =
    typeof documentRef.getElementById === "function"
      ? documentRef.getElementById("fabBtn")
      : null;
  const modelState = buildModelState(apiConfig || {}, resolvedLiveFixture);
  const effectiveTemplateStore =
    templateStore || resolvedLiveFixture?.templateStore || createCanvasAgentTemplateStore({ workspaceStore });
  const controller = createAppAssistantPanel({
    document: documentRef,
    api: effectiveApi,
    graphStore: graphAdapter,
    buildContext: contextBuilder,
    conversationStore,
    selectedModel: modelState.selectedModel,
    modelOptions: modelState.modelOptions,
    modelConfigRequired: modelState.modelConfigRequired,
    executeActions,
    templateStore: effectiveTemplateStore,
    canvasSkillsRuntime: effectiveCanvasSkillsRuntime,
    noticeDurationMs: arguments[0]?.noticeDurationMs,
    noticeFadeMs: arguments[0]?.noticeFadeMs,
    setTimeoutFn: arguments[0]?.setTimeoutFn,
    clearTimeoutFn: arguments[0]?.clearTimeoutFn,
    launcherElement,
  }).init();
  const shouldLoadConfig =
    !resolvedLiveFixture &&
    typeof configLoader === "function" &&
    !hasProviderConfig(apiConfig);
  controller.modelConfigReady = shouldLoadConfig
    ? Promise.resolve()
        .then(() => configLoader())
        .then((nextConfig) => {
          const nextModelState = buildModelState(nextConfig || getApiConfigSnapshot() || {}, null);
          controller.updateModelRegistry?.(nextModelState);
          return nextModelState;
        })
        .catch((error) => {
          controller.state.lastReceipt = error?.message || "Failed to load assistant model configuration.";
          return null;
        })
    : Promise.resolve(modelState);
  // F10 down-link: read legacyQmai from the canvas-agent status and gate
  // the legacy QMAI entry points (default off -> ViMax owns the director
  // lane). Fail-open: any error leaves the dormant default.
  if (!resolvedLiveFixture && typeof effectiveApi?.status === "function") {
    void Promise.resolve()
      .then(() => effectiveApi.status())
      .then((status) => {
        if (status && typeof status === "object" && controller.state) {
          controller.state.legacyQmaiEnabled = status.legacyQmai === true;
        }
      })
      .catch(() => {});
  }
  if (autoInstall && globalThis.window) {
    globalThis.window.__huanyingCanvasAgentAssistant = controller;
  }
  return controller;
}

function autoInstallWhenReady() {
  const documentRef = globalThis.document;
  if (!documentRef || globalThis.window?.__huanyingCanvasAgentAssistant) {
    return;
  }
  const install = () => installAppAssistantPanel({ document: documentRef });
  if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
    documentRef.addEventListener("DOMContentLoaded", install, { once: true });
    return;
  }
  install();
}

autoInstallWhenReady();
