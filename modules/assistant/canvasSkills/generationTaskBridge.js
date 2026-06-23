import { resolveRendererBridge } from "./adapters/rendererBridgeAdapter.js";
import { statusPatchForNode } from "./generationStateMapper.js";

function text(value) {
  return String(value ?? "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const id = text(nodeId);
  return graphNodes(graphStore).find((node) => text(node?.id) === id) || graphStore?.getNode?.(id) || null;
}

function instanceFromBridge(rendererBridge, nodeId) {
  const instances = rendererBridge?.nodeInstances;
  if (!instances) return null;
  if (typeof instances.get === "function") return instances.get(nodeId) || null;
  if (instances.map && typeof instances.map.get === "function") return instances.map.get(nodeId) || null;
  return instances[nodeId] || null;
}

function generationMethod(instance) {
  if (typeof instance?.submitGenerationFromAgent === "function") return instance.submitGenerationFromAgent;
  if (typeof instance?.submitGeneration === "function") return instance.submitGeneration;
  if (typeof instance?._onGenerate === "function") return instance._onGenerate;
  if (typeof instance?.onGenerate === "function") return instance.onGenerate;
  return null;
}

function isReady(rendererBridge, nodeId) {
  const hasMountProbe =
    typeof rendererBridge?.isNodeMounted === "function" ||
    typeof rendererBridge?.getMountedWrapper === "function";
  const mounted = rendererBridge?.isNodeMounted?.(nodeId) ?? Boolean(rendererBridge?.getMountedWrapper?.(nodeId));
  const instance = instanceFromBridge(rendererBridge, nodeId);
  return { ready: (hasMountProbe ? mounted : Boolean(instance)) && Boolean(generationMethod(instance)), instance };
}

function isTerminalSubmitResult(output) {
  if (!output || typeof output !== "object") return false;
  return Boolean(
    output.completed === true ||
      output.done === true ||
      output.status === "completed" ||
      output.generationStatus === "completed"
  );
}

function nodeData(node) {
  return node?.data && typeof node.data === "object" ? node.data : node || {};
}

function terminalGenerationStatusFromNode(node) {
  const data = nodeData(node);
  if (data.jobStatus === "error" || data.asyncTaskStatus === "failed") return "failed";
  if (data.jobStatus === "success" || data.asyncTaskStatus === "success") return "completed";
  if (data.asyncTaskStatus === "cancelled") return "cancelled";
  if (
    data.generationStatus === "completed" ||
    data.generationStatus === "failed" ||
    data.generationStatus === "cancelled" ||
    data.generationStatus === "paused"
  ) {
    return data.generationStatus;
  }
  return "";
}

function askRendererToMount(rendererBridge, nodeId) {
  rendererBridge?.pinNode?.(nodeId, "assistant-generation");
  const options = { reason: "assistant-generation", select: true, scrollIntoView: true };
  rendererBridge?.ensureNodeMounted?.(nodeId, options);
  rendererBridge?.scrollNodeIntoView?.(nodeId, options);
  rendererBridge?.focusNode?.(nodeId, options);
}

export function createGenerationTaskBridge({
  graphStore,
  rendererBridge,
  rendererBridgeResolver = null,
  windowRef = globalThis.window,
  pollIntervalMs = 25,
  readinessTimeoutMs = 8000,
  hiddenWaitCapMs = 300000,
  hiddenPollIntervalMs = 250,
} = {}) {
  const pending = new Map();

  function isDocumentHidden() {
    return windowRef?.document?.visibilityState === "hidden";
  }

  function currentRendererBridge() {
    const resolved = typeof rendererBridgeResolver === "function" ? rendererBridgeResolver() : null;
    return resolved || resolveRendererBridge({ rendererBridge, windowRef });
  }

  function patchNode(nodeId, status, extra = {}) {
    const patch = statusPatchForNode(status, extra);
    patchNodeData(nodeId, patch);
  }

  function patchNodeData(nodeId, patch) {
    graphStore?.updateNodeData?.(nodeId, patch);
    const node = findNode(graphStore, nodeId);
    if (!node) return;
    if (node.data && typeof node.data === "object") {
      node.data = { ...node.data, ...patch };
    } else {
      Object.assign(node, patch);
    }
  }

  function patchTerminalNode(nodeId, status) {
    const { jobStatus, asyncTaskStatus, ...patch } = statusPatchForNode(status);
    patchNodeData(nodeId, patch);
  }

  async function waitForReady(nodeId) {
    const startedAt = Date.now();
    let visibleElapsedMs = 0;
    let lastTickAt = startedAt;
    let mountRequestedBridge = null;
    // The renderer mounts nodes from its rAF loop, which browsers freeze in
    // hidden tabs — only count time toward the readiness timeout while the
    // document is visible, with a wall-clock cap so a hidden tab cannot wait
    // forever.
    while (visibleElapsedMs <= readinessTimeoutMs && Date.now() - startedAt <= hiddenWaitCapMs) {
      if (!findNode(graphStore, nodeId)) {
        return { ready: false, deleted: true, warning: `node deleted before generation: ${nodeId}` };
      }
      const bridge = currentRendererBridge();
      if (bridge && bridge !== mountRequestedBridge) {
        askRendererToMount(bridge, nodeId);
        mountRequestedBridge = bridge;
      }
      const ready = isReady(bridge, nodeId);
      if (ready.ready) return { ...ready, rendererBridge: bridge };
      const hidden = isDocumentHidden();
      await sleep(hidden ? Math.max(pollIntervalMs, hiddenPollIntervalMs) : pollIntervalMs);
      const now = Date.now();
      if (!hidden) visibleElapsedMs += now - lastTickAt;
      lastTickAt = now;
    }
    return { ready: false, warning: `renderer not ready before timeout for ${nodeId}` };
  }

  async function submit({ nodeId, prompt = "", task = {} } = {}) {
    const id = text(nodeId);
    const node = findNode(graphStore, id);
    if (!node) return { started: false, retryable: false, warning: `node not found: ${id || "unknown"}` };
    if (pending.has(id)) return pending.get(id);

    const promise = (async () => {
      patchNode(id, "pendingRenderer", { warning: "waiting for node renderer" });
      graphStore?.setSelectedNodes?.([id]);
      askRendererToMount(currentRendererBridge(), id);
      const ready = await waitForReady(id);
      if (!ready.ready) {
        const warning = ready.warning || `renderer not ready before timeout for ${id}`;
        patchNode(id, ready.deleted ? "failed" : "retryable", { warning, error: warning });
        currentRendererBridge()?.unpinNode?.(id, "assistant-generation");
        return { started: false, retryable: !ready.deleted, warning };
      }
      patchNode(id, "submitting");
      const run = generationMethod(ready.instance);
      try {
        const current = findNode(graphStore, id) || node;
        const data = nodeData(current);
        patchNode(id, "running");
        const output = await run.call(ready.instance, prompt || data.prompt || "", {
          ...task,
          nodeId: id,
          nodeType: current.type || data.nodeType,
          source: "assistant",
        });
        const terminalStatus = terminalGenerationStatusFromNode(findNode(graphStore, id) || current);
        if (terminalStatus) {
          patchTerminalNode(id, terminalStatus);
        } else if (isTerminalSubmitResult(output)) {
          patchNode(id, "completed");
        } else {
          patchNode(id, "running");
        }
        return { started: output?.started !== false, result: output };
      } catch (error) {
        const warning = error?.message || String(error || "generation submit failed");
        patchNode(id, "retryable", { warning, error: warning });
        return { started: false, retryable: true, warning };
      } finally {
        (ready.rendererBridge || currentRendererBridge())?.unpinNode?.(id, "assistant-generation");
        pending.delete(id);
      }
    })();

    pending.set(id, promise);
    return promise;
  }

  function snapshot() {
    return Array.from(pending.keys()).map((nodeId) => ({ nodeId, status: "pendingRenderer" }));
  }

  return { submit, retry: submit, waitForReady, snapshot, currentRendererBridge };
}
