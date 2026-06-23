import { createGenerationTaskBridge } from "../generationTaskBridge.js";

function text(value) {
  return String(value ?? "").trim();
}

function graphNodes(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore;
  const nodes = state?.nodes || graphStore?.nodes;
  if (Array.isArray(nodes)) return nodes;
  if (nodes instanceof Map) return Array.from(nodes.values());
  if (nodes && typeof nodes === "object") return Object.values(nodes);
  return [];
}

function findNode(graphStore, nodeId) {
  return graphNodes(graphStore).find((node) => text(node?.id) === text(nodeId));
}

function instanceFromBridge(rendererBridge, nodeId) {
  const instances = rendererBridge?.nodeInstances;
  if (!instances) return null;
  if (typeof instances.get === "function") return instances.get(nodeId) || null;
  if (instances.map && typeof instances.map.get === "function") return instances.map.get(nodeId) || null;
  return instances[nodeId] || null;
}

function generationMethod(instance) {
  if (typeof instance?._onGenerate === "function") return instance._onGenerate;
  if (typeof instance?.onGenerate === "function") return instance.onGenerate;
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createNodeLifecycleAdapter({
  graphStore,
  nodeFlows,
  rendererBridge,
  rendererBridgeResolver = null,
  windowRef = globalThis.window,
  generationTaskBridge = null,
  pollIntervalMs = 25,
  readinessTimeoutMs = 8000,
} = {}) {
  const bridge =
    generationTaskBridge ||
    createGenerationTaskBridge({
      graphStore,
      rendererBridge,
      rendererBridgeResolver,
      windowRef,
      pollIntervalMs,
      readinessTimeoutMs,
    });

  function currentRendererBridge() {
    return typeof rendererBridgeResolver === "function" ? rendererBridgeResolver() || rendererBridge : rendererBridge;
  }

  async function createDraftNode({ nodeType, name = "", patch = {}, width = 320, height = 220 } = {}) {
    if (typeof nodeFlows?.createNodeAtCursor !== "function") {
      return { ok: false, nodeId: "", warning: "createNodeAtCursor unavailable" };
    }
    const node = await nodeFlows.createNodeAtCursor(nodeType, width, height, name || "");
    const nodeId = text(node?.id || node?.nodeId);
    if (!nodeId) return { ok: false, nodeId: "", warning: "created node has no id" };
    if (patch && Object.keys(patch).length) {
      graphStore?.updateNodeData?.(nodeId, patch);
      const created = findNode(graphStore, nodeId) || node;
      if (created) created.data = { ...(created.data || {}), ...patch };
    }
    graphStore?.setSelectedNodes?.([nodeId]);
    return { ok: true, nodeId, node: findNode(graphStore, nodeId) || node };
  }

  function updateNode({ nodeId, patch = {} } = {}) {
    const id = text(nodeId);
    const node = findNode(graphStore, id);
    if (!node) return { ok: false, nodeId: id, warning: `node not found: ${id || "unknown"}` };
    graphStore?.updateNodeData?.(id, patch);
    node.data = { ...(node.data || {}), ...patch };
    graphStore?.setSelectedNodes?.([id]);
    return { ok: true, nodeId: id, node };
  }

  async function waitForReady(nodeId) {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= readinessTimeoutMs) {
      const bridge = currentRendererBridge();
      const hasMountProbe = typeof bridge?.isNodeMounted === "function" || typeof bridge?.getMountedWrapper === "function";
      const mounted = bridge?.isNodeMounted?.(nodeId) ?? Boolean(bridge?.getMountedWrapper?.(nodeId));
      const instance = instanceFromBridge(bridge, nodeId);
      if ((hasMountProbe ? mounted : Boolean(instance)) && generationMethod(instance)) {
        return { ready: true, instance };
      }
      await sleep(pollIntervalMs);
    }
    return { ready: false, instance: instanceFromBridge(currentRendererBridge(), nodeId) };
  }

  async function generateNode({ nodeId, prompt = "", task = {} } = {}) {
    return bridge.submit({ nodeId, prompt, task });
  }

  return { createDraftNode, updateNode, generateNode, waitForReady, generationTaskBridge: bridge };
}
